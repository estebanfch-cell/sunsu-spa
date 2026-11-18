// TK95: relleno de teléfono/email — solo vacíos, cédula primero, nombre exacto,
// ambiguos se registran y no se adivinan. Los asserts no miran valores de contacto
// más que para confirmar el formato y que no se pisan.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  contactoDeAcuity, contactoDeAntigua, contactoDeFactura, contactoParaMostrar,
  emailOk, rellenarContactos, resumenRelleno, telOk,
} from "./clientes_contacto.ts";

describe("TK95 · rellenar contactos de clientas", () => {
  it("llena un teléfono y un email vacíos emparejando por cédula, sin tocar lo que ya está", () => {
    const r = rellenarContactos(
      [
        { key: "c:1", cedula: "0911111111", nombre: "Ana Perez", telefono: "", email: "" },
        { key: "c:2", cedula: "0922222222", nombre: "Bea Ruiz", telefono: "+593 99 111 1111", email: "ya@ex.com" },
      ],
      [
        { cedula: "0911111111", nombre: "Ana Perez", telefono: "0991234567", email: "ana@ex.com", fuente: "acuity" },
        { cedula: "0922222222", nombre: "Bea Ruiz", telefono: "0999999999", email: "otra@ex.com", fuente: "acuity" },
      ],
    );
    assert.equal(r.telFilled, 1);
    assert.equal(r.emailFilled, 1);
    assert.equal(r.updates.length, 1);
    assert.equal(r.updates[0].key, "c:1");
    assert.equal(r.updates[0].fuenteTel, "acuity");
    assert.equal(telOk(r.updates[0].telefono).startsWith("+593"), true);
    assert.equal(r.updates[0].email, "ana@ex.com");
    assert.equal(r.ambiguous.length, 0);
  });

  it("si no hay cédula, usa el nombre exacto (sin tildes ni mayúsculas)", () => {
    const r = rellenarContactos(
      [{ key: "n:maria fernanda perez", nombre: "María Fernanda Pérez", telefono: "", email: "" }],
      [{ nombre: "MARIA FERNANDA PEREZ", telefono: "0998765432", email: "mf@ex.com", fuente: "antiguas" }],
    );
    assert.equal(r.telFilled, 1);
    assert.equal(r.emailFilled, 1);
    assert.equal(r.updates[0].fuenteEmail, "antiguas");
  });

  it("un nombre que coincide con dos clientas no se adivina: queda en ambiguos", () => {
    const r = rellenarContactos(
      [
        { key: "c:a", cedula: "", nombre: "Ana Perez", telefono: "", email: "" },
        { key: "c:b", cedula: "", nombre: "Ana Perez", telefono: "", email: "" },
      ],
      [{ nombre: "Ana Perez", telefono: "0991234567", email: "a@ex.com", fuente: "acuity" }],
    );
    assert.equal(r.updates.length, 0);
    assert.ok(r.ambiguous.some((a) => a.campo === "clienta" && a.n === 2));
  });

  it("dos valores distintos para el mismo campo se registran como ambiguos y no se llenan", () => {
    const r = rellenarContactos(
      [{ key: "c:1", cedula: "0911111111", nombre: "Ana", telefono: "", email: "" }],
      [
        { cedula: "0911111111", email: "uno@ex.com", fuente: "migo" },
        { cedula: "0911111111", email: "dos@ex.com", fuente: "acuity" },
      ],
    );
    assert.equal(r.emailFilled, 0);
    assert.ok(r.ambiguous.some((a) => a.campo === "email"));
  });

  it("Migo manda sobre Acuity y antiguas cuando el valor es único por fuente preferida, y el mismo valor no es conflicto", () => {
    const r = rellenarContactos(
      [{ key: "c:1", cedula: "0911111111", nombre: "Ana", telefono: "", email: "" }],
      [
        { cedula: "0911111111", email: "ana@ex.com", fuente: "antiguas" },
        { cedula: "0911111111", email: "ana@ex.com", fuente: "acuity" },
        { cedula: "0911111111", email: "ana@ex.com", fuente: "migo" },
      ],
    );
    assert.equal(r.emailFilled, 1);
    assert.equal(r.updates[0].fuenteEmail, "migo");
    assert.equal(r.ambiguous.length, 0);
  });

  it("contactoParaMostrar usa la ficha, luego el registro, luego antiguas, y no pisa un valor ya visto", () => {
    const c = contactoParaMostrar([
      { telefono: "", email: "" },
      { telefono: "0991111111", email: "" },
      { telefono: "0992222222", email: "old@ex.com" },
    ]);
    assert.equal(c.telefono.startsWith("+593"), true);
    assert.equal(c.email, "old@ex.com");
  });

  it("resumenRelleno no incluye teléfonos, correos ni cédulas", () => {
    const r = rellenarContactos(
      [{ key: "c:1", cedula: "0911111111", nombre: "Ana", telefono: "", email: "" }],
      [{ cedula: "0911111111", telefono: "0991234567", email: "ana@ex.com", fuente: "acuity" }],
    );
    const j = JSON.stringify(resumenRelleno(r));
    assert.equal(/0991234567|ana@ex.com|0911111111/.test(j), false);
    assert.equal(resumenRelleno(r).tel_rellenados, 1);
  });

  it("parsers de Acuity, factura Migo y antiguas", () => {
    const a = contactoDeAcuity({ firstName: "Ana", lastName: "Perez", phone: "0991234567", email: "ana@ex.com", certificate: "0911111111" });
    assert.ok(a && a.fuente === "acuity" && emailOk(a.email) === "ana@ex.com");
    const f = contactoDeFactura({ cliente: "Ana Perez", cliente_email: "ana@ex.com", cliente_telefono: "0991234567", cliente_cedula: "0911111111" });
    assert.ok(f && f.fuente === "migo");
    const g = contactoDeAntigua({ nombre: "Ana Perez", telefono: "", tel_acuity: "0991234567", email: "ana@ex.com", cedula: "0911111111" });
    assert.ok(g && telOk(g.telefono).startsWith("+593"));
    assert.equal(contactoDeFactura({ cliente: "Ana", total: 10 }), null);
  });
});
