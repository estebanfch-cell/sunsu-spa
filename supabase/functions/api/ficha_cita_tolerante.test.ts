import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fichaDeCita } from "./agenda_api.ts";

// Emilia 26/11: «las clientas ya se registran, pero en la app no aparecen» — la cita de Acuity no encontraba su ficha.
const regs = [
  { id: 1, cedula: "1705391413", nombre: "María Lorena", apellido: "Garcés Rivadeneira", telefono: "0984000001", timestamp: "2026-11-25T22:17:46Z" },
  { id: 2, cedula: "604656934", nombre: "Camila", apellido: "Buenaño", telefono: "0984000002", timestamp: "2026-11-25T12:49:03Z" },
  { id: 3, cedula: "1718819236", nombre: "Mateo Isaac ", apellido: "Mera", telefono: "0984000003" },
  { id: 4, cedula: "1714825757", nombre: "Angela", apellido: "Mejia Garces", telefono: "0984000004" },
  { id: 5, cedula: "1", nombre: "María", apellido: "Banda Paz" },
  { id: 6, cedula: "2", nombre: "María", apellido: "Torres" },
  { id: 7, cedula: "1111111116", nombre: "Ana", apellido: "Perez", telefono: "0999111111" },
  { id: 8, cedula: "2222222222", nombre: "Ana Lucia", apellido: "Perez", telefono: "0999222222" },
];

describe("ficha de registro para la cita (tolerante)", () => {
  it("se mantiene la regla estricta", () => {
    assert.equal(fichaDeCita(regs, "María", "Banda")?.cedula, "1");
    assert.equal(fichaDeCita(regs, "María", ""), null);
    assert.equal(fichaDeCita(regs, "Angela", "Mejia")?.cedula, "1714825757");
  });
  it("encuentra el registro con segundo nombre y sin tildes", () => {
    assert.equal(fichaDeCita(regs, "Lorena", "Garces")?.cedula, "1705391413");
  });
  it("ignora signos en el apellido de Acuity", () => {
    assert.equal(fichaDeCita(regs, "Camila", "Buenaño.")?.cedula, "604656934");
  });
  it("nombres invertidos solo con el mismo teléfono", () => {
    assert.equal(fichaDeCita(regs, "Isaac Mateo", "Mera Campos", "+593 98 400 0003")?.cedula, "1718819236");
  });
  it("si hay dos posibles, decide el teléfono; sin teléfono no adivina", () => {
    assert.equal(fichaDeCita(regs, "Ana", "Perez Gomez"), null);
    assert.equal(fichaDeCita(regs, "Ana", "Perez Gomez", "0999222222")?.cedula, "2222222222");
  });
  it("no empareja solo por un apellido", () => {
    assert.equal(fichaDeCita(regs, "Lucía", "Garces"), null);
  });
});
