// Conteo y lista de lo que un admin tiene que aprobar al entrar al dashboard:
// solicitudes de cambio, borradores Migo pendientes de aprobar, permisos/vacaciones
// y ajustes de stock pendientes. Sin cédulas, teléfonos ni correos.
import { extend } from "./handlers.ts";
import { esAdmin } from "./permisos.ts";
import { s, type Row } from "./domain.ts";
import type { Ctx, Ses } from "./lib.ts";
import { abiertoSinTicket, listoBorrador, listarBorradoresVisibles } from "./borradores_asig.ts";

async function todas(ctx: Ctx, t: string): Promise<Row[]> {
  try { return await ctx.db.all(t); } catch { return []; }
}

function ymd(v: unknown): string {
  return s(v).slice(0, 10);
}

export type AprItem = {
  tipo: string;
  id: string;
  titulo: string;
  detalle: string;
  cuando: string;
  href: string;
  prueba?: boolean;
};

export type AprGrupo = { id: string; titulo: string; n: number; href: string; items: AprItem[] };

export async function recaudarAprobaciones(ctx: Ctx, ses: Ses): Promise<{ total: number; grupos: AprGrupo[] }> {
  const grupos: AprGrupo[] = [];

  const sols = (await todas(ctx, "solicitudes_cambio"))
    .filter((r) => s(r.estado) === "pendiente")
    .filter((r) => r.prueba === true ? s(r.prueba_para) === ses.uid || esAdmin(ses.rol) : true)
    .sort((a, b) => s(b.creado).localeCompare(s(a.creado)));
  grupos.push({
    id: "solicitudes",
    titulo: "Solicitudes de cambio",
    n: sols.length,
    href: "#/m/aprobaciones",
    items: sols.slice(0, 40).map((r) => ({
      tipo: "solicitud",
      id: s(r.id),
      titulo: (s(r.solicitante) || "Alguien") + (r.prueba === true ? " · PRUEBA" : ""),
      detalle: s(r.etiqueta) || (s(r.tipo) === "eliminacion" ? "pide eliminar" : "pide un cambio") + (s(r.tabla) ? " · " + s(r.tabla) : ""),
      cuando: s(r.creado),
      href: s(r.enlace) || "#/m/aprobaciones",
      prueba: r.prueba === true,
    })),
  });

  let borr: Row[] = [];
  try { borr = (await listarBorradoresVisibles(ctx, ses)).filter(abiertoSinTicket); } catch { borr = []; }
  const listos = borr.filter(listoBorrador);
  const otros = borr.filter((b) => !listoBorrador(b));
  const itemsBor: AprItem[] = [
    ...listos.map((b) => ({
      tipo: "borrador",
      id: s(b.factura),
      titulo: "Ticket por aprobar · fac. " + s(b.factura),
      detalle: [s(b.cliente) || s((b.datos as Row | undefined)?.cliente), s(b.asignado_a) ? "asignado a " + s(b.asignado_a) : "sin asignar"].filter(Boolean).join(" · "),
      cuando: ymd(b.fecha) || s(b.completado_at),
      href: "#/m/borradores",
    })),
    ...otros.map((b) => ({
      tipo: "borrador",
      id: s(b.factura),
      titulo: (s(b.asignado_a) ? "Por completar" : "Sin asignar") + " · fac. " + s(b.factura),
      detalle: [s(b.cliente), s(b.asignado_a) ? "asignado a " + s(b.asignado_a) : "falta asignar"].filter(Boolean).join(" · "),
      cuando: ymd(b.fecha),
      href: "#/m/borradores",
    })),
  ];
  grupos.push({
    id: "borradores",
    titulo: "Borradores / tickets por aprobar",
    n: itemsBor.length,
    href: "#/m/borradores",
    items: itemsBor.slice(0, 40),
  });

  const pers = (await todas(ctx, "permisos"))
    .filter((r) => /pend/i.test(s(r.estado)) && r.origin !== "test")
    .sort((a, b) => s(b.creado || b.desde).localeCompare(s(a.creado || a.desde)));
  grupos.push({
    id: "permisos",
    titulo: "Permisos y vacaciones",
    n: pers.length,
    href: "#/m/personal/permisos",
    items: pers.slice(0, 40).map((r) => ({
      tipo: "permiso",
      id: s(r.id || r.id_1),
      titulo: (s(r.empleada) || s(r.nombre) || "Alguien") + " · " + (s(r.tipo) || "permiso"),
      detalle: [ymd(r.desde), ymd(r.hasta) && ymd(r.hasta) !== ymd(r.desde) ? "a " + ymd(r.hasta) : ""].filter(Boolean).join(" "),
      cuando: ymd(r.desde) || s(r.creado),
      href: "#/m/personal/permisos",
    })),
  });

  const aj = (await todas(ctx, "beta_ajustes"))
    .filter((r) => s(r.estado) === "pendiente")
    .sort((a, b) => s(b.creado_at).localeCompare(s(a.creado_at)));
  grupos.push({
    id: "ajustes",
    titulo: "Ajustes de stock",
    n: aj.length,
    href: "#/m/ajustes",
    items: aj.slice(0, 40).map((r) => ({
      tipo: "ajuste",
      id: s(r.id || r.numero),
      titulo: s(r.numero) || s(r.id) || "Ajuste",
      detalle: [s(r.motivo), s(r.bodega), s(r.creado_por) ? "por " + s(r.creado_por) : ""].filter(Boolean).join(" · "),
      cuando: s(r.creado_at),
      href: s(r.id) ? "#/m/ajustes/a/" + encodeURIComponent(s(r.id)) : "#/m/ajustes",
    })),
  });

  const total = grupos.reduce((acc, g) => acc + g.n, 0);
  return { total, grupos };
}

function pubItem(it: AprItem): Row {
  return {
    tipo: it.tipo, id: it.id, titulo: it.titulo, detalle: it.detalle,
    cuando: it.cuando, href: it.href, ...(it.prueba ? { prueba: true } : {}),
  };
}

extend("aprobaciones_pendientes", "any", async (_p, ctx, ses) => {
  if (!esAdmin(ses.rol)) return { error: "Solo administración ve las aprobaciones pendientes" };
  const data = await recaudarAprobaciones(ctx, ses);
  return {
    ok: true,
    total: data.total,
    grupos: data.grupos.map((g) => ({
      id: g.id, titulo: g.titulo, n: g.n, href: g.href,
      items: g.items.map(pubItem),
    })),
  };
});
