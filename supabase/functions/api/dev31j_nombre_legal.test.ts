import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { elegirNombreLegal } from "./rol_nombres.ts";

describe("DEV-31j nombre legal (t926u)", () => {
  it("usa el nombre completo y no el nombre corto de la app", () => {
    assert.equal(elegirNombreLegal("ROBLES POGO ANDREA DEL CISNE", "Andrea"), "ROBLES POGO ANDREA DEL CISNE");
    assert.equal(elegirNombreLegal("RODRIGUEZ HERNANDEZ JAZIEL ALEJANDRA", "Alejandra"), "RODRIGUEZ HERNANDEZ JAZIEL ALEJANDRA");
    assert.equal(elegirNombreLegal("", "Andrea"), "Andrea");
    assert.equal(elegirNombreLegal("Andrea", "Andrea"), "Andrea");
  });
});

describe("DEV-31j _rolNombre", () => {
  it("en el rol prefiere nombreCompleto", () => {
    const src = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    const pick = (name: string) => {
      const i = src.indexOf("function " + name + "(");
      let depth = 0, j = src.indexOf("{", i);
      for (; j < src.length; j++) { if (src[j] === "{") depth++; else if (src[j] === "}" && --depth === 0) break; }
      return src.slice(i, j + 1);
    };
    const fn = new Function(`${pick("_rolNombre")}\nreturn _rolNombre;`)() as (d: unknown) => string;
    assert.equal(fn({ nombre: "Andrea", nombreCompleto: "ROBLES POGO ANDREA DEL CISNE" }), "ROBLES POGO ANDREA DEL CISNE");
    assert.equal(fn({ nombre: "Andrea" }), "Andrea");
  });
});
