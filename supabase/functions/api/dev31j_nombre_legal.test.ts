import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { elegirNombreLegal, filaEmpleadaDe, personaCortaDe } from "./rol_nombres.ts";

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

describe("DEV-31k resolver de empleada (t929u)", () => {
  const rows = [
    { nombre_app: "Andrea", apellidos_y_nombres: "ROBLES POGO ANDREA DEL CISNE", cedula: "1726468133.0" },
    { nombre_app: "Alejandra", apellidos_y_nombres: "RODRIGUEZ HERNANDEZ JAZIEL ALEJANDRA", cedula: "1725626905" },
    { nombre_app: "Daniela", apellidos_y_nombres: "MORA PUETATE DANIELA CONSUELO", cedula: "1004665699.0" },
    { nombre_app: "Evelyn", apellidos_y_nombres: "TOAPANTA QUISHPE EVELYN ANABEL", cedula: null },
  ];
  it("el nombre legal de IESS resuelve a Alejandra (nombre corto), no deja el rol en cero", () => {
    const hit = filaEmpleadaDe(rows, "RODRIGUEZ HERNANDEZ JAZIEL ALEJANDRA");
    assert.equal(personaCortaDe(hit), "Alejandra");
    assert.equal(personaCortaDe(filaEmpleadaDe(rows, "Alejandra")), "Alejandra");
    assert.equal(personaCortaDe(filaEmpleadaDe(rows, "Alejandra", "1725626905")), "Alejandra");
  });
  it("no confunde a Andrea ni a las demás", () => {
    assert.equal(personaCortaDe(filaEmpleadaDe(rows, "Andrea")), "Andrea");
    assert.equal(personaCortaDe(filaEmpleadaDe(rows, "MORA PUETATE DANIELA CONSUELO")), "Daniela");
    assert.equal(personaCortaDe(filaEmpleadaDe(rows, "TOAPANTA QUISHPE EVELYN ANABEL")), "Evelyn");
  });
});

describe("DEV-31k minitablero del rol (t929u/t930u)", () => {
  it("las tarjetas muestran solo el total de días, sueldo+bono y comisiones por separado", () => {
    const src = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    const pick = (name: string) => {
      const i = src.indexOf("function " + name + "(");
      let depth = 0, j = src.indexOf("{", i);
      for (; j < src.length; j++) { if (src[j] === "{") depth++; else if (src[j] === "}" && --depth === 0) break; }
      return src.slice(i, j + 1);
    };
    const fn = new Function(`${pick("_rolNum")}\n${pick("_rolHrs")}\n${pick("_rolDiasLinea")}\n${pick("_rolNombre")}\n${pick("_rolDiasTotal")}\n${pick("_rolComisiones")}\n${pick("_lineasRol")}\n${pick("_htmlRolKpis")}\nreturn { kpis: _htmlRolKpis, dias: _rolDiasTotal, com: _rolComisiones };`)() as {
      kpis: (d: unknown) => string; dias: (d: unknown) => number; com: (d: unknown) => number;
    };
    const d = {
      diasTrabajados: 14, diasFest: 3, diasDesc: 1, diasAsumidos: 4, faltas: 0,
      sueldo: 482, bono: 130,
      comFaciales: 348, comExtras: 86, comPaquetes: 457, comProductos: 168.68, comRecepcion: 0,
      iess: 161.99, totalEgresos: 661.99, totalRecibir: 1378.02,
    };
    assert.equal(fn.dias(d), 22);
    assert.equal(fn.com(d), 1059.68);
    const html = fn.kpis(d);
    assert.equal(html.includes("Días feriado"), false);
    assert.equal(html.includes("Días trabajados 14"), false);
    assert.match(html, />Días<\/span><b>22/);
    assert.match(html, /Sueldo \+ bono/);
    assert.match(html, /\$612\.00/);
    assert.match(html, /Comisiones/);
    assert.match(html, /\$1059\.68/);
    assert.match(html, /Neto/);
    assert.match(html, /\$1378\.02/);
  });

  it("la tarjeta Comisiones no suma dos veces extras/recepción cuando viene comFacialesSolo (Alejandra)", () => {
    const src = readFileSync(new URL("../../../beta-screens.js", import.meta.url), "utf8");
    const pick = (name: string) => {
      const i = src.indexOf("function " + name + "(");
      let depth = 0, j = src.indexOf("{", i);
      for (; j < src.length; j++) { if (src[j] === "{") depth++; else if (src[j] === "}" && --depth === 0) break; }
      return src.slice(i, j + 1);
    };
    const fn = new Function(`${pick("_rolNum")}\n${pick("_rolHrs")}\n${pick("_rolDiasLinea")}\n${pick("_rolNombre")}\n${pick("_rolDiasTotal")}\n${pick("_rolComisiones")}\n${pick("_lineasRol")}\n${pick("_htmlRolKpis")}\nreturn { kpis: _htmlRolKpis, com: _rolComisiones };`)() as {
      kpis: (d: unknown) => string; com: (d: unknown) => number;
    };
    const d = {
      diasTrabajados: 15, diasFest: 2, diasDesc: 0, diasAsumidos: 3,
      sueldo: 482, bono: 30,
      comFaciales: 63.5, comFacialesSolo: 0, comFacialesExtrasRecep: 63.5,
      comExtras: 1, comPaquetes: 0, comProductos: 54.06, comRecepcion: 62.5,
      comisiones: 117.56, iess: 67.54, totalEgresos: 67.54, totalRecibir: 746.84,
    };
    assert.equal(fn.com(d), 117.56);
    const html = fn.kpis(d);
    assert.match(html, /Comisiones/);
    assert.match(html, /\$117\.56/);
    assert.equal(html.includes("181.06"), false);
    assert.match(html, /\$746\.84/);
  });
});
