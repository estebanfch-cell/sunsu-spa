import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import type { Row } from "./domain.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

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

function seed() {
  return new MemoryDb({
    usuarios: [
      { id: "emi", nombre: "Emi", short: "Emi", rol: "super_admin", bloqueado: false },
      { id: "efch", nombre: "EFCH", short: "EFCH", rol: "super_admin", bloqueado: false },
      { id: "andrea", nombre: "Andrea Robles", short: "Andrea", rol: "cosmetologa", bloqueado: false },
      { id: "daniela", nombre: "Daniela Mora", short: "Daniela", rol: "cosmetologa", bloqueado: false },
      { id: "evelyn", nombre: "Evelyn Anabel Toapanta Quishpe", short: "Evelyn", rol: "cosmetologa", bloqueado: false },
      { id: "alejandra", nombre: "Alejandra Rodriguez", short: "Alejandra", rol: "recepcion", bloqueado: false },
      { id: "visor", nombre: "Skin Analysis", short: "Visor", rol: "visor", bloqueado: false },
    ],
    cosmetologas: [
      { id: "andrea", nombre: "Andrea Robles", patron: "andrea%", es_cosmetologa: true, activa: true },
      { id: "daniela", nombre: "Daniela Mora", patron: "daniela%", es_cosmetologa: true, activa: true },
      { id: "evelyn", nombre: "Evelyn Anabel Toapanta Quishpe", patron: "evelyn%", es_cosmetologa: true, activa: true },
      { id: "alejandra", nombre: "Alejandra Rodriguez", patron: "alejandra%", es_cosmetologa: false, activa: true },
    ],
    tickets: [
      { id: 1, sheet_row: 1, timestamp: "2026-10-27T15:00:00Z", atendido_por: "Andrea Robles", id_3: "0101", facial_hecho: "SUNSU-01", orig: {} },
      { id: 2, sheet_row: 2, timestamp: "2026-10-28T15:00:00Z", atendido_por: "Daniela Mora", id_3: "0102", facial_hecho: "SUNSU-01", orig: {} },
      { id: 3, sheet_row: 3, timestamp: "2026-10-29T15:00:00Z", atendido_por: "Evelyn Anabel Toapanta Quishpe", id_3: "0103", facial_hecho: "SUNSU-01", orig: {} },
    ],
    catalogo: [
      { sku: "SUNSU-01", producto_servicio: "Facial S.O.S", subtotal: 30, tipo: "FACIAL", orig: {} },
    ],
  });
}

describe("TK222 Comisiones: al escoger una persona carga su tabla", () => {
  it("el selector de persona y el de ciclo disparan cargarComisiones y la tabla sale en el primer render", () => {
    const html = readFileSync(join(root, "index.html"), "utf8");
    assert.match(html, /async function cargarComisiones/);
    assert.match(html, /id="com-persona" onchange="cargarComisiones\(\)"/);
    assert.match(html, /id="com-ciclo" onchange="cargarComisiones\(\)"/);
    assert.match(html, /id="com-ver" onclick="cargarComisiones\(\)"/);
    assert.match(html, /<div id="com-tabla">\$\{htmlComTabla\(data\)\}<\/div>/);
    assert.match(html, /comPersona\.onchange = \(\) => \{ void cargarComisiones\(\); \}/);
  });

  it("getComisionesTabla no incluye visor ni administradoras, y cada empleada carga sus filas", async () => {
    const db = seed();
    const c = ctx(db, "super_admin", "emi", "Emi");
    const base = await handle("getComisionesTabla", { token: c.token, desde: "2026-10-26", hasta: "2026-10-26" }, c) as Row;
    assert.equal(base.ok, true);
    const nombres = (base.personas as string[]) || [];
    for (const no of ["Skin Analysis", "Visor", "Emi", "EMI", "EFCH", "Emilia"]) {
      assert.equal(nombres.some((n) => String(n).toLowerCase() === no.toLowerCase()), false, "no debería salir " + no);
    }
    const pedidas = ["Alejandra", "Andrea", "Daniela", "Evelyn"];
    for (const persona of pedidas) {
      const r = await handle("getComisionesTabla", { token: c.token, desde: "2026-10-26", hasta: "2026-10-26", persona }, c) as Row;
      assert.equal(r.error, undefined, persona + " no debería fallar");
      assert.equal(r.ok, true);
      assert.match(String(r.persona), new RegExp(persona, "i"));
      assert.ok(Array.isArray(r.filas) && (r.filas as Row[]).length > 0, persona + " debe traer filas");
      assert.ok((r.filas as Row[]).some((f) => f.concepto === "Total"));
    }
    const staff = ctx(db, "cosmetologa", "andrea", "Andrea Robles");
    const propia = await handle("getComisionesTabla", { token: staff.token, desde: "2026-10-26", hasta: "2026-10-26", persona: "Daniela" }, staff) as Row;
    assert.match(String(propia.persona), /Andrea/);
    assert.equal(propia.todas, undefined);
  });
});
