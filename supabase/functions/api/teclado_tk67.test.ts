// TK67 (Emilia 18/11): la barra de abajo nunca queda encima del teclado del iPhone.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const html = readFileSync(join(import.meta.dirname, "../../../index.html"), "utf8");
describe("TK67 · barra de abajo y teclado", () => {
  it("se esconde con un campo enfocado o el visualViewport achicado, en toda la app", () => {
    assert.match(html, /body\.kb-open \.tabbar, body\.kb-open \[data-oculta-teclado\] \{ display: none !important; \}/);
    assert.match(html, /body\.kb-open \{ --tab-h: 0px; \}/);
    assert.match(html, /addEventListener\("focusin"/);
    assert.match(html, /visualViewport\.addEventListener\("resize"/);
    assert.match(html, /checkbox\|radio\|button/);
  });
});
