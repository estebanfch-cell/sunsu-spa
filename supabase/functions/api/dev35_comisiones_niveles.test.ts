import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import {
  comisionPaquetesTramo,
  comisionPaquetesTramoFactor,
  desglosePaquetesTramo,
  type Row,
} from "./domain.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const file = (p: string) => readFileSync(join(root, p), "utf8");
const CACHE = "sunsu-2026-11-26-PAQ1215";

function ctx(db: MemoryDb, rol = "admin", uid = "emi", name = "Emi") {
  const token = "t-" + uid;
  db.tables.set("sesiones", [{ token, uid, rol, exp: "2099-01-01T00:00:00.000Z" }]);
  const users = db.tables.get("usuarios") || [];
  if (!users.some((u) => u.id === uid)) users.push({ id: uid, nombre: name, short: name, rol, bloqueado: false });
  db.tables.set("usuarios", users);
  return {
    db, now: new Date("2026-11-25T16:00:00Z"),
    env: {} as Record<string, string | undefined>,
    fetchImpl: fetch,
    legacyLogin: async () => ({ ok: false }),
    token,
  };
}

function seed(tickets: Row[], catalogo?: Row[]) {
  return new MemoryDb({
    usuarios: [
      { id: "emi", nombre: "Emi", short: "Emi", rol: "super_admin", bloqueado: false },
      { id: "efch", nombre: "EFCH", short: "EFCH", rol: "super_admin", bloqueado: false },
      { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      { id: "daniela", nombre: "Daniela Mora", short: "Daniela", rol: "cosmetologa", bloqueado: false },
    ],
    cosmetologas: [
      { id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es_cosmetologa: true, activa: true },
      { id: "daniela", nombre: "Daniela Mora", patron: "daniela%", es_cosmetologa: true, activa: true },
    ],
    tickets,
    catalogo: catalogo || [{ sku: "SUNSU-18", producto_servicio: "Facial Reparación x3", subtotal: 100, tipo: "PAQUETE", orig: {} }],
  });
}

function packTk(id: number, when: string, cosm = "Andrea Robles", extra: Row = {}): Row {
  return {
    id, sheet_row: id, timestamp: when, atendido_por: cosm, id_3: "0101",
    facial_hecho: "SUNSU-01", compra_pack_3: "SUNSU-18 x3 Facial Reparación", orig: {},
    ...extra,
  };
}

function htmlFns() {
  const src = file("index.html");
  const names = ["htmlComGrid", "htmlComNiveles", "htmlComDet"];
  const chunks: string[] = [];
  for (const name of names) {
    const start = src.indexOf("function " + name + "(");
    assert.ok(start >= 0, name + " existe");
    let end = src.length;
    for (const other of ["function htmlComTabla", "function htmlComSum", "function renderComisiones", "function cargarComisiones", "async function "]) {
      const i = src.indexOf(other, start + 1);
      if (i > start && i < end) end = i;
    }
    chunks.push(src.slice(start, end));
  }
  const sandbox: Record<string, unknown> = {
    esc: (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)),
    money: (n: unknown) => {
      const x = Number(n);
      return Number.isFinite(x) ? "$" + x.toFixed(2) : "";
    },
    codigoCom: (sku: unknown) => String(sku || "").toUpperCase().replace(/^SUNSU-/, ""),
  };
  vm.runInNewContext(chunks.join("\n"), sandbox);
  return sandbox as {
    htmlComGrid: (lineas: unknown, vacio?: string) => string;
    htmlComNiveles: (d: unknown, total: unknown) => string;
    htmlComDet: (concepto: string, d: unknown, total: unknown) => string;
  };
}

describe("DEV-35 Comisiones: desglose Niveles dentro de Paquetes", () => {
  it("el pin de caché es DEV35 y coincide en index.html y sw.js", () => {
    assert.match(file("sw.js"), new RegExp(`const CACHE = "${CACHE}"`));
    assert.match(file("index.html"), new RegExp(`window\\.SUNSU_CACHE = "${CACHE}"`));
  });

  it("desglose sin factores sigue igual y suma lo mismo que comisionPaquetesTramo", () => {
    const netos = Array.from({ length: 12 }, () => 100);
    const partes = desglosePaquetesTramo(12, undefined, netos);
    const total = comisionPaquetesTramo(12, undefined, netos).monto;
    assert.equal(total, 66);
    assert.equal(partes.reduce((a, t) => a + t.monto, 0), total);
    assert.deepEqual(partes.map((t) => [t.desde, t.n, t.pct, t.monto]), [[1, 10, 5, 50], [11, 2, 8, 16]]);
  });

  it("con factor (ticket subido tarde) el desglose suma exactamente comisionPaquetesTramoFactor", () => {
    const netos = Array.from({ length: 12 }, () => 100);
    const factores = netos.map((_, i) => (i === 4 ? 0.5 : 1));
    const partes = desglosePaquetesTramo(12, undefined, netos, factores);
    const total = comisionPaquetesTramoFactor(netos, factores).monto;
    assert.equal(total, 63.5);
    assert.equal(partes.reduce((a, t) => a + t.monto, 0), total);
    assert.equal(partes[0].n, 10);
    assert.equal(partes[0].monto, 47.5);
    assert.equal(partes[1].n, 2);
    assert.equal(partes[1].monto, 16);
  });

  it("getComisionesTabla: tramos y paquetesDet conviven y los montos de tramo igualan la fila Paquetes", async () => {
    const tickets = Array.from({ length: 12 }, (_, i) => packTk(i + 1, `2026-10-2${7 + (i % 3)}T15:00:00Z`));
    const db = seed(tickets);
    const c = ctx(db);
    const tabla = await handle("getComisionesTabla", { token: c.token, desde: "2026-10-26", hasta: "2026-10-26", persona: "Andrea" }, c) as Row;
    const filas = tabla.filas as Row[];
    const det = tabla.detalle as Row;
    const total = filas.find((f) => f.concepto === "Paquetes")?.total;
    assert.equal(total, 66);
    assert.equal(det.paquetes, 12);
    assert.ok(Array.isArray(det.paquetesDet) && (det.paquetesDet as Row[]).length >= 1);
    const tramos = det.tramos as Row[];
    assert.equal(tramos.length, 2);
    assert.equal(tramos[0].pct, "5%");
    assert.equal(tramos[0].n, 10);
    assert.equal(tramos[0].monto, 50);
    assert.equal(tramos[1].pct, "8%");
    assert.equal(tramos[1].n, 2);
    assert.equal(tramos[1].monto, 16);
    assert.equal(tramos.reduce((a, t) => a + Number(t.monto), 0), total);
  });

  it("un paquete subido tarde no cambia la cuenta por nivel y el desglose iguala el total pagado", async () => {
    const tickets = Array.from({ length: 12 }, (_, i) => packTk(i + 1, `2026-10-2${7 + (i % 3)}T15:00:00Z`, "Andrea Robles", i === 4 ? { orig: { subido_tarde: true, comision_factor: 0.5 } } : {}));
    const db = seed(tickets);
    const c = ctx(db);
    const tabla = await handle("getComisionesTabla", { token: c.token, desde: "2026-10-26", hasta: "2026-10-26", persona: "Andrea" }, c) as Row;
    const total = (tabla.filas as Row[]).find((f) => f.concepto === "Paquetes")?.total;
    const tramos = (tabla.detalle as Row).tramos as Row[];
    assert.equal(total, 63.5);
    assert.equal(tramos.reduce((a, t) => a + Number(t.monto), 0), total);
    assert.equal(tramos[0].n, 10);
    assert.equal(tramos[1].n, 2);
  });

  it("en el ciclo viejo de niveles, el desglose muestra Nivel N8 y el premio no cambia", async () => {
    const tickets = [packTk(1, "2026-09-28T15:00:00Z"), packTk(2, "2026-10-02T15:00:00Z")];
    const db = seed(tickets);
    const c = ctx(db);
    const tabla = await handle("getComisionesTabla", { token: c.token, desde: "2026-09-26", hasta: "2026-09-26", persona: "Andrea" }, c) as Row;
    const total = (tabla.filas as Row[]).find((f) => f.concepto === "Paquetes")?.total;
    const det = tabla.detalle as Row;
    assert.equal(det.regimen, "nivel");
    assert.equal(det.nivel, "N8");
    assert.equal(total, 320);
    const tramos = det.tramos as Row[];
    assert.equal(tramos.length, 1);
    assert.equal(tramos[0].etiqueta, "N8");
    assert.equal(tramos[0].n, 2);
    assert.equal(tramos[0].monto, 320);
    assert.equal(tramos[0].monto, total);
  });

  it("la staff solo ve sus propias comisiones aunque pida a otra persona", async () => {
    const tickets = [
      packTk(1, "2026-10-27T15:00:00Z", "Andrea Robles"),
      packTk(2, "2026-10-27T16:00:00Z", "Daniela Mora"),
    ];
    const db = seed(tickets);
    const staff = ctx(db, "cosmetologa", "andrea", "Andrea Robles");
    const propia = await handle("getComisionesTabla", { token: staff.token, desde: "2026-10-26", hasta: "2026-10-26", persona: "Daniela" }, staff) as Row;
    assert.match(String(propia.persona), /Andrea/);
    assert.equal(propia.todas, undefined);
    const total = (propia.filas as Row[]).find((f) => f.concepto === "Paquetes")?.total;
    assert.equal(total, 5);
    const tramos = (propia.detalle as Row).tramos as Row[];
    assert.equal(tramos.reduce((a, t) => a + Number(t.monto), 0), total);
    assert.equal((propia.detalle as Row).paquetes, 1);
  });

  it("al expandir Paquetes se ven la tabla por producto y el bloque Niveles, y los textos cuadran con el total", () => {
    const html = file("index.html");
    assert.match(html, /function htmlComNiveles\(/);
    assert.match(html, /class="com-niveles"/);
    const paq = html.slice(html.indexOf('if (concepto === "Paquetes")'), html.indexOf('if (concepto === "Productos")'));
    assert.match(paq, /htmlComGrid\(items/);
    assert.match(paq, /htmlComNiveles\(d, total\)/);
    const fns = htmlFns();
    const d = {
      paquetes: 28,
      paquetesDet: [{ sku: "SUNSU-18", nombre: "Facial Reparación x3", qty: 12, monto: 129 }],
      tramos: [
        { etiqueta: "1–10", pct: "5%", n: 10, monto: 132 },
        { etiqueta: "11–20", pct: "8%", n: 10, monto: 151 },
        { etiqueta: "21–30", pct: "11%", n: 8, monto: 174 },
      ],
    };
    const out = fns.htmlComDet("Paquetes", d, 457);
    assert.match(out, /Facial Reparación x3/);
    assert.match(out, /<div class="com-sumario">Niveles<\/div>/);
    assert.match(out, /10 paquetes al 5%/);
    assert.match(out, /10 paquetes al 8%/);
    assert.match(out, /8 paquetes al 11%/);
    assert.match(out, /\$132\.00/);
    assert.match(out, /\$151\.00/);
    assert.match(out, /\$174\.00/);
    const nivel = fns.htmlComNiveles({ regimen: "nivel", paquetes: 2, nivel: "N8", tramos: [{ etiqueta: "N8", pct: "", n: 2, monto: 320 }] }, 320);
    assert.match(nivel, /2 paquetes · Nivel N8/);
    assert.match(nivel, /\$320\.00/);
  });
});
