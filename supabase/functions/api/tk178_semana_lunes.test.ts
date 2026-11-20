import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { lunesADomingo } from "./asistencia_api.ts";

const src = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
const portal = readFileSync(new URL("../../../mc-portal.js", import.meta.url), "utf8");
const pick = (name: string) => { const i = src.indexOf("function " + name + "("); let d = 0, j = src.indexOf("{", i); for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}" && --d === 0) break; } return src.slice(i, j + 1); };
const esc = (x: unknown) => String(x ?? "");

describe("TK178 semanas de lunes a domingo", () => {
  it("backend: 'Esta semana' y vista Semana usan lunes→domingo", () => {
    assert.deepEqual(lunesADomingo("2026-11-20"), { desde: "2026-11-16", hasta: "2026-11-22" });
    assert.deepEqual(lunesADomingo("2026-11-22"), { desde: "2026-11-16", hasta: "2026-11-22" });
    assert.deepEqual(lunesADomingo("2026-11-16"), { desde: "2026-11-16", hasta: "2026-11-22" });
  });
  it("frontend: vista Semana es una fila Lun..Dom y el rótulo dice lun–dom", () => {
    const fns = ["hHm", "minDia", "etiquetaDiaAsis", "celdaAsis", "lunesDeYmd", "sumarDiasYmd", "textoSemanaAsis", "htmlAsisSemanaGrid", "htmlAsisMesGrid"];
    const { sem, mes, txt } = new Function("esc", "ymdGuayaquil", fns.map(pick).join("\n") + ";return {sem: htmlAsisSemanaGrid, mes: htmlAsisMesGrid, txt: textoSemanaAsis};")(esc, () => "2026-11-20");
    assert.equal(txt("2026-11-22"), "lun 16 nov – dom 22 nov");
    const h = sem({ dias: [{ fecha: "2026-11-16", workedMin: 548 }] }, "2026-11-20");
    const nums = [...h.matchAll(/<span class="n">(\d+)/g)].map((m) => m[1]);
    assert.deepEqual(nums, ["16", "17", "18", "19", "20", "21", "22"]);
    assert.ok(h.indexOf(">Lun<") < h.indexOf(">Dom<"));
    const m = mes({ dias: [] }, "2026-11-01");
    assert.equal((m.match(/asis-celda vacio/g) || []).length, 6); // 1/11/2026 es domingo → última columna
  });
  it("portal de reservas también empieza en lunes", () => {
    assert.match(portal, /\["L", "M", "M", "J", "V", "S", "D"\]/);
    assert.match(portal, /getUTCDay\(\) \+ 6\) % 7/);
  });
});
