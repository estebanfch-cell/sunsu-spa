import { extend } from "./handlers.ts";
import type { Ctx, Ses } from "./lib.ts";
import { actorOf } from "./lib.ts";
import { ErpError, runErp } from "./erp.ts";
import { acceso, esAdmin, matrizDe, type Acceso } from "./permisos.ts";
import { s, type Row } from "./domain.ts";

const MOD: Record<string, string> = {
  home: "inicio", erp_home: "inicio",
  prod_list: "productos", prod_get: "productos", prod_save: "productos",
  prov_list: "proveedores", prov_save: "proveedores",
  cli_list: "clientes", cli_save: "clientes",
  stk_saldo: "inventario", stk_kardex: "kardex",
  rfq_list: "compras", rfq_save: "compras", rfq_respuesta: "compras", rfq_adjudicar: "compras",
  oc_list: "compras", oc_get: "compras", oc_save: "compras", oc_cancel: "compras",
  oc_recibir: "compras", oc_recibir_undo: "compras", oc_devolver: "compras", pago_save: "compras",
  reorden_sugerir: "compras", refs: "compras",
  trf_list: "transferencias", trf_save: "transferencias", trf_enviar: "transferencias", trf_recibir: "transferencias",
  conteo_list: "conteos", conteo_abrir: "conteos", conteo_guardar: "conteos", conteo_aplicar: "conteos",
  ajuste_save: "inventario",
  ov_list: "tickets", ov_get: "tickets", ov_save: "tickets", ov_anular: "tickets", ticket_aplicar: "tickets",
};

const ESCRITURA = new Set(["prod_save", "prov_save", "cli_save", "rfq_save", "rfq_respuesta", "rfq_adjudicar", "oc_save", "oc_cancel", "oc_recibir", "oc_recibir_undo", "oc_devolver", "pago_save", "trf_save", "trf_enviar", "trf_recibir", "conteo_abrir", "conteo_guardar", "conteo_aplicar", "ajuste_save", "ov_save", "ov_anular"]);

function permitido(op: string, rol: string, matriz: Record<string, Partial<Record<string, Acceso>>>): boolean {
  const mod = MOD[op];
  if (!mod) return false;
  if (acceso(rol, mod, matriz) === "no") return false;
  if (ESCRITURA.has(op) && (mod === "compras" || mod === "proveedores") && !esAdmin(rol)) return false;
  if (op === "prod_save" && !esAdmin(rol)) return false;
  if ((op === "conteo_aplicar" || op === "ajuste_save") && !esAdmin(rol) && acceso(rol, "inventario", matriz) !== "todos" && acceso(rol, "conteos", matriz) !== "todos") return false;
  return true;
}

for (const op of Object.keys(MOD)) {
  extend(op, "any", async (p, ctx: Ctx, ses: Ses) => {
    const matriz = await matrizDe(ctx.db);
    if (!permitido(op, ses.rol, matriz)) return { error: "No tienes permiso" };
    try {
      const out = await runErp(op, p as Row, ctx.db, actorOf(ses), ctx.now);
      return out;
    } catch (e) {
      if (e instanceof ErpError && e.requiere) {
        return { ok: false, requiere_aprobacion: true, negativo: e.negativo, error: e.message };
      }
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });
}

extend("whoami", "any", async (_p, ctx, ses) => {
  const matriz = await matrizDe(ctx.db);
  let esCosm = false;
  const marks = await ctx.db.all("cosmetologas");
  const m = marks.find((x) => x.id === ses.uid || s(x.nombre).toLowerCase().startsWith(ses.name.toLowerCase().split(" ")[0] || "—"));
  esCosm = !!m && m.es_cosmetologa === true;
  const { modulosVisibles } = await import("./permisos.ts");
  return {
    ok: true,
    user: { id: ses.uid, name: ses.name, short: ses.short, role: ses.rol, es_cosmetologa: esCosm },
    modulos: modulosVisibles(ses.rol, matriz),
    ver_costos: acceso(ses.rol, "ver_costos", matriz) === "todos",
    modo_prueba: !!ses.prueba,
  };
});

extend("permisos_get", "any", async (_p, ctx, ses) => {
  if (ses.rol !== "super_admin" && ses.rol !== "admin_master") return { error: "No tienes permiso" };
  const matriz = await matrizDe(ctx.db);
  return { ok: true, roles: ["cosmetologa", "asistente_cosmetologia", "recepcion", "gerente"], modulos: (await import("./permisos.ts")).MODULOS, matriz, nota: "admin y super_admin siempre ven todo. La bandera es_cosmetologa no se edita aquí: vive en cosmetologas y es la que usa el cálculo de paquetes." };
});

extend("permisos_guardar", "any", async (p, ctx, ses) => {
  if (ses.rol !== "super_admin" && ses.rol !== "admin_master") return { error: "Solo la mega admin puede cambiar la matriz" };
  const rol = s(p.rol);
  const modulo = s(p.modulo);
  const acc = s(p.acceso);
  if (rol === "admin" || rol === "super_admin" || modulo === "permisos") return { error: "Ese permiso no se puede delegar" };
  if (!["cosmetologa", "asistente_cosmetologia", "recepcion", "gerente"].includes(rol)) return { error: "Rol no editable" };
  if (!["no", "propio", "todos"].includes(acc)) return { error: "Acceso inválido" };
  if (modulo === "ver_costos" && acc !== "no") return { error: "Los costos solo los ven admin y super_admin" };
  const rows = await ctx.db.all("app_modulos");
  const hit = rows.find((r) => r.rol === rol && r.modulo === modulo);
  if (hit) await ctx.db.write(actorOf(ses), "app_modulos", "update", { rol, modulo }, { acceso: acc });
  else await ctx.db.write(actorOf(ses), "app_modulos", "insert", {}, { rol, modulo, acceso: acc });
  return { ok: true };
});
