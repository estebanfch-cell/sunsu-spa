// TK219 (Emilia): en cada ticket, el personal (p. ej. Alejandra) puede escribir un
// número de factura Migo, ver si cuadra (clienta, monto, ±3 días, ya ligada a otros)
// y confirmar el vínculo o cambiar una factura equivocada. Queda en bitácora.
// El visor no puede usarlo. Nunca se devuelven teléfonos, correos, dirección ni RUC.
import { extend } from "./handlers.ts";
import { n, s, skuCode, type Row } from "./domain.ts";
import { actorOf, logAccion, type Ctx, type Ses } from "./lib.ts";
import { acceso, esAdmin, esVisor, esPropio, matrizDe } from "./permisos.ts";
import { facturaNorm, fechaGye, namesMatch, type LinkCuadre } from "./migo_cuadre.ts";
import { diasEntre, VENTANA_DIAS } from "./cuadre_ventana.ts";
import { cuadreTrasTicket } from "./migo_cuadre_api.ts";
import { totalValorTicket } from "./ticket_lista_card.ts";

const TOL = 0.05;
const CONTACTO = /^(tel|fono|phone|correo|email|mail|direccion|dirección|address|ruc|cliente_ruc|cliente_email|cliente_telefono|cliente_direccion|docs_cliente|emails_cliente)$/i;

function cents(v: number): number { return Math.round((Number(v) || 0) * 100); }
function cerca(a: number, b: number, tol = TOL): boolean {
  return Math.abs(cents(a) - cents(b)) <= Math.round(tol * 100);
}
function money(v: number): number { return Math.round((Number(v) || 0) * 100) / 100; }

function sinContacto<T>(x: T): T {
  if (x == null || typeof x !== "object") return x;
  if (Array.isArray(x)) return x.map(sinContacto) as T;
  const out: Row = {};
  for (const [k, v] of Object.entries(x as Row)) {
    if (CONTACTO.test(k)) continue;
    out[k] = sinContacto(v);
  }
  return out as T;
}

async function catalogoMap(ctx: Ctx): Promise<Map<string, Row>> {
  const m = new Map<string, Row>();
  try {
    for (const r of await ctx.db.all("catalogo")) {
      const k = skuCode(r.sku);
      if (k) m.set(k, r);
    }
  } catch { /* catalogo opcional en tests */ }
  return m;
}

function claveTicket(t: Row): string {
  return s(t.so_num) || s(t.clave) || s(t.beta_num) || (t.sheet_row != null && t.sheet_row !== "" ? "r" + s(t.sheet_row) : s(t.id));
}

function fechaTicket(t: Row): string {
  return s(t.fecha).slice(0, 10) || fechaGye(t.timestamp) || fechaGye(t.ts) || "";
}

function nombreTicket(t: Row): string {
  return (s(t.nombre) + " " + s(t.apellido)).trim();
}

function totalTicket(t: Row, cab: Row | undefined, cat: Map<string, Row>): number {
  const tot = totalValorTicket(t, { cab, map: cat, canje: false });
  if (tot > 0.004) return money(tot);
  return money(n(t.estimado));
}

function facturaDe(t: Row, cab: Row | undefined, link: Row | undefined): string {
  return facturaNorm(cab?.datos && typeof cab.datos === "object" ? (cab.datos as Row).factura : "")
    || facturaNorm(t.fac_7) || facturaNorm(link?.factura);
}

async function todas(ctx: Ctx, table: string): Promise<Row[]> {
  try { return await ctx.db.all(table); } catch { return []; }
}

async function puedeLigar(ctx: Ctx, ses: Ses, t: Row): Promise<{ error: string } | null> {
  if (esVisor(ses.rol)) return { error: "Esta cuenta solo puede consultar clientas y citas" };
  const matriz = await matrizDe(ctx.db);
  const acc = acceso(ses.rol, "tickets", matriz);
  if (acc === "no") return { error: "No tienes permiso" };
  if (acc === "propio" && !esAdmin(ses.rol) && !esPropio(s(t.atendido_por) || s(t.cosmetologa), ses)) {
    return { error: "Solo puedes asociar facturas de tus propios tickets" };
  }
  return null;
}

function lineasPub(raw: unknown): Row[] {
  const arr = Array.isArray(raw) ? raw as Row[] : [];
  return arr.map((l) => ({
    sku: s(l.sku || l.codigo),
    nombre: s(l.producto || l.nombre || l.producto_servicio),
    cantidad: n(l.cantidad) || 1,
    total: money(n(l.total)),
  })).filter((l) => l.sku || l.nombre);
}

function buscarFactura(vivo: Row[], borradores: Row[], fac: string): { vivo?: Row; borrador?: Row } {
  const v = vivo.find((x) => facturaNorm(x.factura) === fac);
  const b = borradores.find((x) => facturaNorm(x.factura) === fac);
  return { vivo: v, borrador: b };
}

function seqDe(fac: string): number {
  const m = /(\d+)$/.exec(fac);
  return m ? Number(m[1]) : 0;
}

function horaGye(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const g = new Date(d.getTime() - 5 * 3600 * 1000);
  const dd = String(g.getUTCDate()).padStart(2, "0");
  const mm = String(g.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(g.getUTCHours()).padStart(2, "0");
  const mi = String(g.getUTCMinutes()).padStart(2, "0");
  return dd + "/" + mm + " " + hh + ":" + mi;
}

// Si la factura es más nueva que la última sincronizada, decirlo claro: no es que
// el ticket esté mal, es que Migo todavía no la mandó a la app.
async function noEncontrada(ctx: Ctx, vivo: Row[], fac: string): Promise<Row> {
  const base = "No encontré la factura " + fac + " en Migo";
  let maxSeq = 0;
  for (const r of vivo) maxSeq = Math.max(maxSeq, n(r.seq) || seqDe(facturaNorm(r.factura) || ""));
  const want = seqDe(fac);
  if (!maxSeq || !want || want <= maxSeq) return { error: base, factura: fac };
  let ult = "";
  try {
    const imps = await ctx.db.all("beta_migo_importes");
    for (const i of imps) if (s(i.imported_at) > ult) ult = s(i.imported_at);
  } catch { /* opcional */ }
  const hace = ult ? (ctx.now.getTime() - new Date(ult).getTime()) / 60000 : 0;
  const ultima = "001-001-" + String(maxSeq).padStart(9, "0");
  let msg = base + ". Todavía no llega a la app: la última factura sincronizada es la " + ultima + ".";
  if (ult && hace > 90) msg += " La sincronización con Migo no corre desde el " + horaGye(ult) + " (hora Ecuador); apenas vuelva, la factura aparece sola.";
  else msg += " La sincronización corre cada hora; intenta de nuevo en un rato.";
  return { error: msg, factura: fac, pendiente_sync: true, ultima_sincronizada: ultima, ultima_sync_at: ult || null };
}

async function cargarTicket(ctx: Ctx, want: string): Promise<{ t: Row; cab?: Row; link?: Row } | { error: string }> {
  const q = s(want).trim();
  if (!q) return { error: "Indica el ticket" };
  const tickets = await todas(ctx, "tickets");
  const t = tickets.find((x) =>
    !x.borrado_at && (claveTicket(x) === q || s(x.id) === q || s(x.beta_num) === q || s(x.sheet_row) === q)
  );
  if (!t) return { error: "No encontré ese ticket" };
  const anul = t.anulado === true || (t.orig && typeof t.orig === "object" && (t.orig as Row).anulado === true);
  if (anul) return { error: "Ese ticket está cancelado" };
  const clave = claveTicket(t);
  const cab = (await todas(ctx, "beta_tickets")).find((c) => s(c.clave) === clave);
  const link = (await todas(ctx, "beta_cuadre_link")).find((L) => n(L.ticket_id) === n(t.id));
  return { t, cab, link };
}

async function preview(ctx: Ctx, ses: Ses, p: Row): Promise<Row> {
  const gate0 = esVisor(ses.rol) ? { error: "Esta cuenta solo puede consultar clientas y citas" } : null;
  if (gate0) return gate0;
  const loaded = await cargarTicket(ctx, s(p.clave || p.ticket_clave || p.ticket_id));
  if ("error" in loaded) return loaded;
  const { t, cab, link } = loaded;
  const no = await puedeLigar(ctx, ses, t);
  if (no) return no;
  const fac = facturaNorm(p.factura);
  if (!fac) return { error: "Escribe el número de factura (ej. 3007 o 001-001-000003007)" };
  const vivo = await todas(ctx, "beta_migo_facturas_vivo");
  const borradores = await todas(ctx, "beta_migo_borradores");
  const hit = buscarFactura(vivo, borradores, fac);
  const src = hit.vivo || hit.borrador;
  if (!src) return await noEncontrada(ctx, vivo, fac);
  const cat = await catalogoMap(ctx);
  const tickets = await todas(ctx, "tickets");
  const cabs = new Map((await todas(ctx, "beta_tickets")).map((c) => [s(c.clave), c]));
  const links = await todas(ctx, "beta_cuadre_link");
  const linkById = new Map(links.map((L) => [n(L.ticket_id), L]));
  const totTk = totalTicket(t, cab, cat);
  const fechaTk = fechaTicket(t);
  const fechaFac = s(src.fecha).slice(0, 10);
  const totFac = money(n(src.total));
  const dias = (fechaTk && fechaFac) ? diasEntre(fechaTk, fechaFac) : 99;
  const nom = namesMatch(nombreTicket(t), src.cliente);
  const actual = facturaDe(t, cab, link);
  const ligados: Row[] = [];
  for (const other of tickets) {
    if (other.borrado_at) continue;
    const oc = cabs.get(claveTicket(other));
    const ol = linkById.get(n(other.id));
    const of = facturaDe(other, oc, ol);
    if (of !== fac) continue;
    ligados.push({
      clave: claveTicket(other),
      nombre: nombreTicket(other),
      fecha: fechaTicket(other),
      total: totalTicket(other, oc, cat),
      es_este: n(other.id) === n(t.id),
    });
  }
  const otros = ligados.filter((x) => !x.es_este);
  const suma = money(totTk + otros.reduce((a, x) => a + n(x.total), 0));
  const avisos: string[] = [];
  if (Math.abs(dias) > VENTANA_DIAS) avisos.push("La fecha está fuera de la ventana de ±" + VENTANA_DIAS + " días (ticket " + (fechaTk || "s/f") + ", factura " + (fechaFac || "s/f") + ")");
  if (nom < 2) avisos.push("El nombre de la factura (" + s(src.cliente) + ") no coincide del todo con la clienta del ticket (" + (nombreTicket(t) || "s/n") + ")");
  if (!cerca(totTk, totFac)) avisos.push("El monto del ticket ($" + totTk.toFixed(2) + ") no es igual al de la factura ($" + totFac.toFixed(2) + ")");
  if (otros.length && !cerca(suma, totFac)) avisos.push("La suma de este ticket y los ya asociados ($" + suma.toFixed(2) + ") no cuadra con la factura ($" + totFac.toFixed(2) + ")");
  if (otros.length && cerca(suma, totFac)) avisos.push("Esta factura ya cubre " + otros.map((x) => s(x.clave)).join(" + ") + ". Si confirmas, se suma este ticket (total $" + suma.toFixed(2) + ")");
  if (actual && actual !== fac) avisos.push("Este ticket hoy está asociado a " + actual + ". Si confirmas, se cambia por " + fac);
  if (actual === fac) avisos.push("Este ticket ya está asociado a " + fac);
  const coinciden = {
    clienta: nom >= 2,
    monto_ticket: cerca(totTk, totFac),
    monto_suma: cerca(suma, totFac),
    fecha: Math.abs(dias) <= VENTANA_DIAS,
    ya_ligada_aqui: actual === fac,
  };
  return sinContacto({
    ok: true,
    factura: fac,
    factura_fecha: fechaFac,
    factura_cliente: s(src.cliente),
    factura_total: totFac,
    factura_forma: s(src.forma || (Array.isArray(src.formas_pago) && src.formas_pago[0] ? (src.formas_pago[0] as Row).forma : "")),
    lineas: lineasPub(hit.vivo?.lineas || hit.borrador?.lineas),
    ticket: { clave: claveTicket(t), nombre: nombreTicket(t), fecha: fechaTk, total: totTk, factura_actual: actual || "" },
    ligados,
    suma,
    dias,
    ventana_dias: VENTANA_DIAS,
    coinciden,
    avisos,
    ya_ligada: actual === fac,
    puede_confirmar: actual !== fac,
  });
}

function estadoLink(diff: number): LinkCuadre["estado"] {
  if (Math.abs(diff) <= TOL) return "cuadra";
  if (Math.abs(diff) <= 0.02) return "redondeo";
  return "diferencia";
}

async function confirmar(ctx: Ctx, ses: Ses, p: Row): Promise<Row> {
  const prevw = await preview(ctx, ses, p);
  if (prevw.error) return prevw;
  if (prevw.ya_ligada) return { ok: true, ya_ligada: true, factura: prevw.factura, ticket_clave: (prevw.ticket as Row).clave, mensaje: "Este ticket ya está asociado a " + prevw.factura };
  if (!p.confirmar) return { error: "Confirma para asociar la factura" };
  const loaded = await cargarTicket(ctx, s(p.clave || p.ticket_clave || p.ticket_id));
  if ("error" in loaded) return loaded;
  const { t, cab } = loaded;
  const fac = s(prevw.factura);
  const clave = claveTicket(t);
  const actor = actorOf(ses);
  const now = ctx.now.toISOString();
  const anterior = s((prevw.ticket as Row).factura_actual) || "";
  const totTk = n((prevw.ticket as Row).total);
  const totFac = n(prevw.factura_total);
  const suma = n(prevw.suma);
  const diff = money(suma - totFac);
  const dias = n(prevw.dias) || 0;
  const hist0 = Array.isArray(cab?.historial) ? [...(cab!.historial as Row[])] : [];
  hist0.push({
    fecha: now, accion: anterior ? "cambiar factura" : "asociar factura",
    detalle: (anterior ? anterior + " → " : "") + fac, actor, total: totTk,
  });
  const prevDatos = { ...((cab?.datos && typeof cab.datos === "object" ? cab.datos : {}) as Row) };
  const datos = sinContacto({
    ...prevDatos,
    factura: fac,
    forma_pago: prevDatos.forma_pago || s(prevw.factura_forma) || prevDatos.forma_pago,
    factura_ligar: { por: actor, at: now, anterior: anterior || null, nueva: fac },
  });
  if (cab) {
    await ctx.db.write(actor, "beta_tickets", "update", { clave }, {
      datos, historial: hist0, updated_at: now, actualizado_por: actor,
    });
  } else {
    await ctx.db.write(actor, "beta_tickets", "insert", {}, {
      clave, sheet_row: t.sheet_row ?? null, datos, historial: hist0, actualizado_por: actor, updated_at: now,
    });
  }
  const row: LinkCuadre = {
    ticket_id: n(t.id), factura: fac, tipo: "manual", confianza: "alta",
    diferencia_monto: diff, diferencia_fecha: dias,
    estado: estadoLink(diff),
    motivo: "Asociado a mano por " + actor + (anterior ? " (antes " + anterior + ")" : ""),
    cliente_migo: s(prevw.factura_cliente), total_factura: totFac, total_tickets: suma,
  };
  const prevLink = (await todas(ctx, "beta_cuadre_link")).find((L) => n(L.ticket_id) === n(t.id));
  const packed: Row = { ...row, updated_at: now };
  if (prevLink) await ctx.db.write(actor, "beta_cuadre_link", "update", { ticket_id: n(t.id) }, packed);
  else await ctx.db.write(actor, "beta_cuadre_link", "insert", {}, packed);

  // Si la factura anterior queda sin tickets, el cuadre reabre el borrador.
  await cuadreTrasTicket(ctx, actor);
  const detalle = clave + " · " + (anterior || "(sin factura)") + " → " + fac
    + " · " + s(prevw.factura_cliente) + " · $" + totFac.toFixed(2)
    + (n(prevw.suma) && !cerca(totTk, totFac) ? " · suma tickets $" + suma.toFixed(2) : "");
  try { await logAccion(ctx.db, actor, "ASOCIAR FACTURA", detalle); } catch { /* log opcional */ }
  return sinContacto({
    ok: true, ligado: true, factura: fac, ticket_clave: clave,
    anterior: anterior || null, avisos: prevw.avisos, coinciden: prevw.coinciden,
  });
}

extend("tk_factura_buscar", "any", async (p, ctx, ses) => preview(ctx, ses, p));
extend("tk_factura_ligar", "any", async (p, ctx, ses) => confirmar(ctx, ses, p));
