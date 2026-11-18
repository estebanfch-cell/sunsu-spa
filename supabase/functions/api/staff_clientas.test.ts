import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { acceso, DEFAULT_MATRIZ } from "./permisos.ts";

describe("TK65 clientas del personal", () => {
  it("el alcance por defecto es todas las clientas, y el front esconde filtros sensibles y descargas", () => {
    assert.equal(acceso("cosmetologa", "clientes", DEFAULT_MATRIZ), "todos");
    assert.equal(acceso("asistente_cosmetologia", "clientes", DEFAULT_MATRIZ), "todos");
    const js = readFileSync(new URL("../../../mc-clientes.js", import.meta.url), "utf8");
    const beta = readFileSync(new URL("../../../beta.html", import.meta.url), "utf8");
    assert.match(js, /Buscar por nombre/);
    assert.match(js, /mccl-filt-btn/);
    assert.match(js, /Filtros/);
    assert.match(js, /El personal no puede descargar archivos/);
    assert.match(js, /K\.admin \? "Buscar por código/);
    // los filtros de cosmetóloga y sector quedan solo para admin
    assert.match(js, /K\.admin[\s\S]*Todas las cosmetólogas/);
    assert.match(js, /K\.admin[\s\S]*Todos los sectores/);
    assert.match(beta, /mc-clientes\.js\?v=20261118tk82/);
  });
});
