import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import type { Row } from "./domain.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const file = (p: string) => readFileSync(join(root, p), "utf8");

describe("TK159 Clientes: orden A→Z y Volver a la lista", () => {
  it("el pin de caché es TK160 y no toca sunsu.html", () => {
    assert.match(file("sw.js"), /const CACHE = "sunsu-2026-11-20-TK163"/);
    assert.match(file("index.html"), /window\.SUNSU_CACHE = "sunsu-2026-11-20-TK163"/);
    assert.match(file("index.html"), /20261120tk163/);
    assert.doesNotMatch(file("sunsu.html"), /TK160|TK159/);
  });

  it("la lista arranca ordenada A→Z por nombre con localeCompare es/base", () => {
    const cl = file("mc-clientes.js");
    assert.match(cl, /sort: "nombre", dir: 1/);
    assert.match(cl, /localeCompare\(String\(\(b && b\.nombre\) \|\| ""\), "es", \{ sensitivity: "base" \}\)/);
    const sandbox: Record<string, unknown> = { window: {}, esc: (s: unknown) => String(s ?? ""), console };
    (sandbox as { window: Record<string, unknown> }).window = sandbox as unknown as Record<string, unknown>;
    vm.runInNewContext(cl, sandbox);
    const MC = (sandbox as { MCClientes: { _k: Record<string, unknown>; items: () => { nombre: string }[] } }).MCClientes;
    const K = MC._k;
    assert.equal(K.sort, "nombre");
    assert.equal(K.dir, 1);
    K.L = [
      { key: "3", nombre: "Zoe Ruiz", codigo: "C-00003" },
      { key: "1", nombre: "ana paz", codigo: "C-00001" },
      { key: "4", nombre: "Érika Pérez", codigo: "C-00004" },
      { key: "2", nombre: "Ángela Mora", codigo: "C-00002" },
    ];
    K.q = "";
    K.f = { cosm: "", sector: "", paq: false, gift: false, visita: "" };
    K.max = 300;
    const names = MC.items().map((c) => c.nombre);
    const expected = ["ana paz", "Ángela Mora", "Érika Pérez", "Zoe Ruiz"].sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" })
    );
    assert.deepEqual(names, expected);
    assert.deepEqual(names, ["ana paz", "Ángela Mora", "Érika Pérez", "Zoe Ruiz"]);
  });

  it("wireFicha reatacha data-go tras repintar la ficha (el Volver vivía dentro de #mccl-root)", () => {
    const cl = file("mc-clientes.js");
    const html = file("index.html");
    assert.match(html, /function bindDataGo\(/);
    assert.match(cl, /id="mccl-volver"/);
    assert.match(cl, /data-go="#\/m\/clientes"/);
    assert.match(cl, /function bindGoCl/);
    assert.match(cl, /bindGoCl\(main\)/);
    const wire = cl.slice(cl.indexOf("function wireFicha"), cl.indexOf("function wireReg"));
    assert.match(wire, /bindGoCl\(main\)/);
    const rep = cl.slice(cl.indexOf("function repintarFicha"), cl.indexOf("function wireFicha"));
    assert.match(rep, /root\.outerHTML = htmlFicha\(\)/);
    assert.match(rep, /wireFicha\(main\)/);
  });
});

describe("TK160 Comisiones: solo comisión, sin Vendido", () => {
  it("la UI de Comisiones no muestra la columna Vendido y compacta Persona+Ciclo+Ver", () => {
    const html = file("index.html");
    assert.match(html, />Categoría<\/span><span>Comisión<\/span>/);
    assert.doesNotMatch(html, />Vendido<\/span>/);
    assert.doesNotMatch(html, /<span class="num">\$\{vendido\}<\/span>/);
    assert.match(html, /class="ss-bar tools com-bar"/);
    assert.match(html, /grid-template-columns: minmax\(0, 1fr\) 4\.6rem/);
    assert.doesNotMatch(html, /grid-template-columns: minmax\(0, 1fr\) 4\.4rem 4\.6rem/);
    assert.match(html, />Código<\/div><div class="cel hd">Producto<\/div><div class="cel hd num">Cant\.<\/div><div class="cel hd num">Comisión/);
  });

  it("getComisionesTabla omite vendido para no-admin y lo conserva para admin (mismas fórmulas)", async () => {
    const db = new MemoryDb({
      usuarios: [
        { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
        { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      ],
      sesiones: [
        { token: "t-emi", uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00.000Z" },
        { token: "t-andrea", uid: "andrea", rol: "cosmetologa", exp: "2099-01-01T00:00:00.000Z" },
      ],
      cosmetologas: [
        { id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es_cosmetologa: true, activa: true },
      ],
      tickets: [
        {
          id: 20, sheet_row: 20, timestamp: "2026-10-27T16:00:00Z", atendido_por: "Andrea Robles", id_3: "0201",
          facial_hecho: "SUNSU-01", ht_002: 2, orig: {},
        },
      ],
      catalogo: [
        { sku: "SUNSU-01", producto_servicio: "Facial S.O.S", subtotal: 30, tipo: "FACIAL", orig: {} },
        { sku: "SUNSU-HT-002", producto_servicio: "Serum niacinamide", subtotal: 20, precio_compra: 8, tipo: "PRODUCTO", orig: {} },
      ],
      rrhh_empleadas: [
        { cedula: "1711", nombre_app: "Andrea", apellidos_y_nombres: "Andrea Robles", sueldo: 460, bono: 40, fondo_reserva: "NO", fecha_ingreso: "2024-01-01", cargo: "Cosmetologa" },
      ],
    });
    const cAdmin = {
      db, now: new Date("2026-11-05T15:00:00Z"),
      env: {} as Record<string, string | undefined>,
      fetchImpl: fetch,
      legacyLogin: async () => ({ ok: false }),
      token: "t-emi",
    };
    const admin = await handle("getComisionesTabla", { token: "t-emi", desde: "2026-10-26", hasta: "2026-10-26", persona: "Andrea Robles" }, cAdmin) as Row;
    const filasA = (admin.filas || []) as Row[];
    const prodA = filasA.find((f) => f.concepto === "Productos");
    assert.ok(prodA && "vendido" in prodA, "admin sigue recibiendo vendido (cálculo intacto)");

    const cStaff = { ...cAdmin, token: "t-andrea" };
    const staff = await handle("getComisionesTabla", { token: "t-andrea", desde: "2026-10-26", hasta: "2026-10-26" }, cStaff) as Row;
    const filasS = (staff.filas || []) as Row[];
    for (const f of filasS) {
      assert.ok(!("vendido" in f), "no-admin no recibe vendido en filas");
      assert.ok(!("vendidoPorCiclo" in f));
    }
    const det = (staff.detalle || {}) as Row;
    assert.ok(!("vendido" in det));
    for (const k of ["productos", "extras", "recepcion", "facialesDet", "paquetesDet"]) {
      for (const ln of ((det[k] || []) as Row[])) {
        assert.ok(!("vendido" in ln), "no-admin no recibe vendido en " + k);
      }
    }
    const totA = filasA.find((f) => f.concepto === "Total")?.total;
    const totS = filasS.find((f) => f.concepto === "Total")?.total;
    assert.equal(totS, totA, "las comisiones no cambian al ocultar vendido");
  });
});
