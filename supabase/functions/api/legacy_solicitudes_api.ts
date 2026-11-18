// Pantallas viejas de Cabina y Registro sin botón «Editar» (Emilia 18/11, TK64): la admin toca el dato y guarda
// solo si cambió; el personal manda la MISMA acción como solicitud (motivo obligatorio) y una admin la aprueba.
// Al aprobar se ejecuta la acción de siempre como la admin que aprueba; rechazar no cambia nada.
import { handle } from "./handlers.ts";
import { SOLICITUD_HOOKS } from "./inline_api.ts";
import { s, type Row } from "./domain.ts";

/** Solo estas acciones se pueden pedir, y cada tabla tiene la suya (no se ejecuta lo que mande el navegador). */
export const LEGACY_PEDIBLE: Record<string, { accion: string; nombre: string; filaDe: (p: Row) => string; borrar?: string }> = {
  cabina_inventario: { accion: "cabinaSaveProducto", nombre: "Producto de cabina", filaDe: (p) => s(p.row), borrar: "cabinaProductoActivo" },
  cabina_activos: { accion: "cabinaSaveActivo", nombre: "Activo de cabina", filaDe: (p) => s(p.row) },
  cabina_protocolo: { accion: "cabinaSaveProtocolo", nombre: "Protocolo", filaDe: (p) => s(p.sku) },
  registro_cliente: { accion: "saveRegistroCliente", nombre: "Ficha de registro", filaDe: (p) => s(p.row) },
};

for (const [tabla, def] of Object.entries(LEGACY_PEDIBLE)) {
  SOLICITUD_HOOKS[tabla] = {
    fila: (_ctx, _ses, fila) => Promise.resolve(fila ? { row: { fila }, antes: {}, etiqueta: def.nombre + " " + fila } : { error: "Falta la fila" }),
    aplicar: async (ctx, ses, fila, propuestos) => {
      const payload = propuestos.__payload && typeof propuestos.__payload === "object" ? { ...(propuestos.__payload as Row) } : null;
      if (!payload) return { error: "La solicitud no trae los datos" };
      if (def.filaDe(payload) !== fila) return { error: "La solicitud no coincide con la fila" };
      delete payload.accion; delete payload.token; delete payload.preview; delete payload.preview_uid;
      payload.usuario = s(ses.name);
      // Solo viajan los campos que el personal cambió: lo que no vio (costos ocultos) o no tocó queda como está.
      const cambiados = new Set(Object.keys(propuestos).filter((k) => !k.startsWith("__")));
      if (tabla !== "cabina_protocolo") {
        const filtra = (o: Row, fijos: string[]) => {
          const out: Row = {};
          for (const k of Object.keys(o)) if (cambiados.has(k) || fijos.includes(k)) out[k] = o[k];
          return out;
        };
        if (payload.campos && typeof payload.campos === "object") payload.campos = filtra(payload.campos as Row, ["codigo"]);
        else Object.assign(payload, filtra(payload, ["row", "codigo", "cedula", "usuario"]));
        for (const k of Object.keys(payload)) if (!["row", "codigo", "cedula", "usuario", "campos"].includes(k) && !cambiados.has(k)) delete payload[k];
      } else if (!cambiados.has("manoObra")) {
        const vig = (await ctx.db.all("cabina_protocolos")).filter((r) => s(r.sku) === fila && s(r.vigente).toUpperCase() !== "NO")
          .sort((a, b) => Number(b.version || 0) - Number(a.version || 0))[0];
        delete payload.manoObra;
        payload.mo = vig ? vig.mano_de_obra : 0;
      }
      return await handle(def.accion, { ...payload, token: ses.token }, ctx) as Row;
    },
    ...(def.borrar ? {
      borrar: async (ctx, ses, fila) => await handle(def.borrar!, { row: Number(fila), activo: false, token: ses.token }, ctx) as Row,
    } : {}),
  };
}
