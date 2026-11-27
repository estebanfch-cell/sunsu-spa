import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { MemoryDb } from "./db.ts";
import { comisionRecepcionDia, esRolRecepcionista, personaEsRecepcionista, CFG_DEF } from "./domain.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import type { Row } from "./domain.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function ctx(db: MemoryDb, rol = "admin", uid = "emi", name = "Emi") {
  const token = "t-" + uid;
  db.tables.set("sesiones", [{ token, uid, rol, exp: "2099-01-01T00:00:00.000Z" }]);
  const users = db.tables.get("usuarios") || [];
  if (!users.some((u) => u.id === uid)) users.push({ id: uid, nombre: name, short: name, rol, bloqueado: false });
  db.tables.set("usuarios", users);
  return {
    db, now: new Date("2026-11-05T15:00:00Z"),
    env: {} as Record<string, string | undefined>,
    fetchImpl: fetch,
    legacyLogin: async () => ({ ok: false }),
    token,
  };
}

function seed() {
  return new MemoryDb({
    usuarios: [
      { id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false },
      { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      { id: "alejandra", nombre: "Alejandra Rodriguez", short: "Alejandra", rol: "recepcion", bloqueado: false },
    ],
    cosmetologas: [
      { id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es_cosmetologa: true, activa: true },
      { id: "alejandra", nombre: "Alejandra Rodriguez", patron: "alejandra%", es_cosmetologa: false, activa: true },
    ],
    tickets: [
      ...Array.from({ length: 12 }, (_, i) => ({
        id: i + 1, sheet_row: i + 1, timestamp: "2026-10-27T15:00:00Z", atendido_por: "Andrea Robles", id_3: "010" + String(i + 1).padStart(2, "0"),
        facial_hecho: "SUNSU-01", orig: {},
      })),
      {
        id: 20, sheet_row: 20, timestamp: "2026-10-27T16:00:00Z", atendido_por: "Andrea Robles", id_3: "0201",
        facial_hecho: "SUNSU-01", compra_pack_3: "SUNSU-18 x3 Facial Reparación",
        ht_002: 2, servicios_adicionales: "Dermaplaning", orig: {},
      },
    ],
    catalogo: [
      { sku: "SUNSU-01", producto_servicio: "Facial S.O.S", subtotal: 30, tipo: "FACIAL", orig: {} },
      { sku: "SUNSU-18", producto_servicio: "Facial Reparación x3", subtotal: 100, tipo: "PAQUETE", orig: {} },
      { sku: "SUNSU-HT-002", producto_servicio: "Serum niacinamide", subtotal: 20, precio_compra: 8, tipo: "PRODUCTO", orig: {} },
    ],
    rrhh_empleadas: [
      { cedula: "1711", nombre_app: "Andrea", apellidos_y_nombres: "Andrea Robles", sueldo: 460, bono: 40, fondo_reserva: "NO", fecha_ingreso: "2024-01-01", cargo: "Cosmetologa" },
      { cedula: "1712", nombre_app: "Alejandra", apellidos_y_nombres: "Alejandra Rodriguez", sueldo: 460, bono: 0, fondo_reserva: "NO", fecha_ingreso: "2024-01-01", cargo: "Recepcion" },
    ],
  });
}

describe("TK105 Mis comisiones recepción y vendido", () => {
  it("el rol de recepcionista se lee de usuarios, no del nombre", () => {
    assert.equal(esRolRecepcionista("recepcion"), true);
    assert.equal(esRolRecepcionista("reception"), true);
    assert.equal(esRolRecepcionista("cosmetologa"), false);
    assert.equal(esRolRecepcionista("admin"), false);
    const users = [
      { id: "alejandra", nombre: "Alejandra Rodriguez", short: "Alejandra", rol: "recepcion", bloqueado: false },
      { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
    ];
    assert.equal(personaEsRecepcionista("Alejandra Rodriguez", users), true);
    assert.equal(personaEsRecepcionista("Andrea Robles", users), false);
    assert.equal(personaEsRecepcionista("Alejandra Rodriguez", [{ id: "alejandra", nombre: "Alejandra Rodriguez", rol: "cosmetologa" }]), false);
    assert.equal(comisionRecepcionDia("2026-10-27", 12, CFG_DEF), 6);
    assert.equal(comisionRecepcionDia("2026-10-27", 9, CFG_DEF), 0);
    assert.equal(comisionRecepcionDia("2026-10-26", 5, CFG_DEF), 2.5); // lunes, mínimo 5
  });

  it("Andrea no ve Recepción; Alejandra sí, con detalle, y no calcula Faciales", async () => {
    const db = seed();
    const c = ctx(db, "admin", "emi", "Emi");
    const andrea = await handle("getComisionesTabla", { token: c.token, desde: "2026-10-26", hasta: "2026-10-26", persona: "Andrea Robles" }, c) as Row;
    const filasA = andrea.filas as Row[];
    assert.deepEqual(filasA.map((f) => f.concepto), ["Faciales", "Paquetes", "Productos", "Extras", "Total"]);
    assert.equal(filasA.find((f) => f.concepto === "Recepción"), undefined);
    assert.ok((filasA.find((f) => f.concepto === "Faciales")?.total as number) > 0);
    const prod = (andrea.detalle as Row).productos as Row[];
    assert.ok(prod[0]?.sku);
    assert.ok(prod[0]?.nombre);
    assert.ok("vendido" in (filasA.find((f) => f.concepto === "Productos") || {}));
    const ventaProd = Number(filasA.find((f) => f.concepto === "Productos")?.vendido);
    assert.equal(ventaProd, 40); // 2 * subtotal 20, neto de catálogo

    const ale = await handle("getComisionesTabla", { token: c.token, desde: "2026-10-26", hasta: "2026-10-26", persona: "Alejandra Rodriguez" }, c) as Row;
    const filasR = ale.filas as Row[];
    assert.deepEqual(filasR.map((f) => f.concepto), ["Paquetes", "Productos", "Extras", "Recepción", "Total"]);
    assert.equal(filasR.find((f) => f.concepto === "Faciales"), undefined);
    const rec = filasR.find((f) => f.concepto === "Recepción") as Row;
    // 13 faciales el 27 oct (mar, mínimo 10) * $0.50
    assert.equal(rec.total, 6.5);
    const det = ale.detalle as Row;
    const dias = det.recepcion as Row[];
    assert.ok(dias.length >= 1);
    assert.equal(dias[0]?.qty, 13);
    assert.equal(dias[0]?.monto, 6.5);
    assert.equal(Number(rec.vendido), 13 * 30);
    assert.equal(det.faciales, 0);

    const rolA = await handle("getRolCiclo", { token: c.token, desde: "2026-10-26", persona: "Andrea Robles" }, c) as Row;
    const ingA = rolA.ingresos as Row[];
    assert.ok(ingA.some((r) => r.concepto === "Faciales"));
    assert.equal(ingA.find((r) => r.concepto === "Recepción"), undefined);

    const rolR = await handle("getRolCiclo", { token: c.token, desde: "2026-10-26", persona: "Alejandra Rodriguez" }, c) as Row;
    const ingR = rolR.ingresos as Row[];
    assert.equal(ingR.find((r) => r.concepto === "Faciales"), undefined);
    assert.equal(ingR.find((r) => r.concepto === "Recepción")?.monto, 6.5);
    const conceptosIng = ingR.map((r) => r.concepto);
    const iExt = conceptosIng.indexOf("Extras");
    const iRec = conceptosIng.indexOf("Recepción");
    assert.ok(iExt >= 0 && iRec === iExt + 1);
  });

  it("la UI alinea Categoría | Comisión (sin Vendido) y el desglose Código | Producto | Cant. | Comisión", () => {
    const beta = readFileSync(join(root, "index.html"), "utf8");
    const sw = readFileSync(join(root, "sw.js"), "utf8");
assert.match(sw, /sunsu-2026-11-27-COMVTA/);
    assert.match(beta, /sunsu-2026-11-27-COMVTA/);
    assert.match(beta, /com-sum-hd/);
    assert.match(beta, />Categoría<\/span><span>Comisión<\/span>/);
    assert.doesNotMatch(beta, />Vendido<\/span>/);
    assert.match(beta, /class="ss-bar tools com-bar"/);
    assert.match(beta, /function htmlComGrid/);
    assert.match(beta, />Código<\/div><div class="cel hd">Producto<\/div><div class="cel hd num">Cant\.<\/div><div class="cel hd num">Comisión</);
    assert.match(beta, /concepto === "Recepción"/);
    assert.match(beta, /-webkit-line-clamp: 2/);
    assert.doesNotMatch(beta, /startsWith\("alejandra"\)/);
    const conceptos = beta.match(/CONCEPTOS|Faciales", "Paquetes", "Productos", "Extras", "Recepción"/);
    // mock: Recepción after Extras, hidden for cosmetóloga
    assert.match(beta, /if \(recep\) fila\("Recepción"/);
    assert.match(beta, /if \(!recep\) fila\("Faciales"/);
  });
});
