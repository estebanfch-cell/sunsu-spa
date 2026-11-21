import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MemoryDb } from "./db.ts";
import { handle } from "./handlers.ts";
import "./handlers_extra.ts";
import "./asistencia_api.ts";
import "./horarios_api.ts";
import type { Row } from "./domain.ts";

describe("TK176 tablero del equipo", () => {
  it("admin ve a todas las activas con sus marcas de hoy; una cosmetóloga no", async () => {
    const db = new MemoryDb({
      sesiones: [{ token: "t-emi", uid: "emi", rol: "admin", exp: "2099-01-01T00:00:00Z" }, { token: "t-dani", uid: "dani", rol: "cosmetologa", exp: "2099-01-01T00:00:00Z" }],
      usuarios: [{ id: "emi", nombre: "Emi", short: "Emi", rol: "admin", bloqueado: false }, { id: "dani", nombre: "Daniela Mora", short: "Daniela", rol: "cosmetologa", bloqueado: false }],
      rrhh_empleadas: [{ nombre_app: "Andrea", apellidos_y_nombres: "Andrea Robles" }, { nombre_app: "Daniela", apellidos_y_nombres: "Daniela Mora" }],
      asistencia_marcajes: [
        { id: "1", nombre: "Daniela Mora", tipo: "entrada", ts: "2026-11-20T14:30:00.000Z", anulado: false },
        { id: "2", nombre: "Daniela Mora", tipo: "salida", ts: "2026-11-19T23:30:00.000Z", anulado: false },
        { id: "3", nombre: "Daniela Mora", tipo: "almuerzo_inicio", ts: "2026-11-20T15:00:00.000Z", anulado: true },
      ],
    });
    const ctx = { db, now: new Date("2026-11-20T15:30:00Z"), env: {}, fetchImpl: fetch, legacyLogin: async () => ({ ok: false }) };
    const r = await handle("asis_tablero", { token: "t-emi" }, ctx) as Row;
    assert.equal(r.ok, true, String(r.error));
    const ps = r.personas as Row[];
    assert.deepEqual(ps.map((p) => p.nombre), ["Andrea", "Daniela"]);
    assert.deepEqual((ps[1].marcas as Row[]).map((m) => m.tipo), ["entrada"]);
    assert.equal((ps[0].marcas as Row[]).length, 0);
    assert.match(String((await handle("asis_tablero", { token: "t-dani" }, ctx) as Row).error), /admin/);
  });

  it("front: colores por estado, cronómetro, refresco y editor al tocar", () => {
    const src = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
    const pick = (name: string) => { const i = src.indexOf("function " + name + "("); let d = 0, j = src.indexOf("{", i); for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}" && --d === 0) break; } return src.slice(i, j + 1); };
    const f = new Function("esc", ["estadoAsisHoy", "fmtCrono", "mkHoraLocal", "htmlTableroAsis"].map(pick).join("\n") + ";return htmlTableroAsis;")((x: unknown) => String(x ?? ""));
    const t = (h: string) => `2026-11-20T${h}:00-05:00`;
    const html = f({ personas: [
      { nombre: "Andrea", marcas: [], jornada: { trabaja: true, desde: "10:00" } },
      { nombre: "Daniela", marcas: [{ tipo: "entrada", ts: t("09:30") }] },
      { nombre: "Alejandra", marcas: [{ tipo: "entrada", ts: t("09:28") }, { tipo: "almuerzo_inicio", ts: t("13:00") }] },
      { nombre: "Evelyn", marcas: [{ tipo: "entrada", ts: t("09:30") }, { tipo: "salida", ts: t("18:30") }] },
      { nombre: "Dejaneira", marcas: [], jornada: { trabaja: false } },
    ] });
    assert.match(html, /tab-verde" data-tab-persona="Andrea"[\s\S]*Por entrar · entra 10:00/);
    assert.match(html, /tab-amarillo" data-tab-persona="Daniela"[\s\S]*entró 09:30/);
    // TK198: el almuerzo ya no se marca; una marca vieja no pausa a nadie.
    assert.match(html, /tab-amarillo" data-tab-persona="Alejandra"[\s\S]*entró 09:28/);
    assert.match(html, /tab-rojo" data-tab-persona="Evelyn"[\s\S]*Fuera[\s\S]*09:00:00/);
    assert.match(html, /tab-gris" data-tab-persona="Dejaneira"[\s\S]*Descanso hoy/);
    assert.match(src, /cargarTableroAsis\(main\);\n  \}, 45000\);/);
    assert.match(src, /abrirEditorTablero\(main, b.getAttribute\("data-tab-persona"\)/);
  });
});
