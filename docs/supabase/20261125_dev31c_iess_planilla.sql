-- DEV-31c (Emilia t911u) · Planillas del IESS importadas (detalle mensual) para compararlas con el rol. Aditivo e idempotente.
-- Cada importación es un lote; reimportar un mes deja el lote anterior como no vigente (no se borra nada).
create table if not exists public.beta_iess_planilla (
  id text primary key,
  lote text not null,
  periodo text not null,
  estado text,
  sub_tipo text,
  cedula text not null,
  nombre text,
  r_trabajo text,
  novedad text,
  sueldo numeric(12,2) not null default 0,
  dias numeric(6,2),
  patronal numeric(12,2) not null default 0,
  individual numeric(12,2) not null default 0,
  aporte_adicional numeric(12,2) not null default 0,
  ccc numeric(12,2) not null default 0,
  total_aporte numeric(12,2) not null default 0,
  archivo text,
  vigente boolean not null default true,
  importado_por text,
  origin text,
  created_at timestamptz not null default now()
);
create index if not exists beta_iess_planilla_idx on public.beta_iess_planilla (periodo, vigente);
alter table public.beta_iess_planilla enable row level security;
grant select, insert, update, delete on public.beta_iess_planilla to sunsu_admin, service_role;
do $$
begin
  execute 'drop policy if exists p_admin on public.beta_iess_planilla';
  execute 'create policy p_admin on public.beta_iess_planilla for all to sunsu_admin using (true) with check (true)';
end $$;

-- app_beta_write: misma función en vivo + beta_iess_planilla.
CREATE OR REPLACE FUNCTION public.app_beta_write(p_actor text, p_table text, p_op text, p_match jsonb, p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  allowed text[] := array['beta_conteos','beta_conteo_lineas','beta_notificaciones','beta_transferencias','beta_transferencia_lineas','beta_ajustes','beta_ajuste_lineas','beta_stock','beta_stock_movimientos','beta_tickets','beta_ticket_lineas','beta_clientes','beta_cliente_notas',
    'beta_acuity_calendars','beta_citas_ticket','beta_ticket_envios','beta_ventas','beta_venta_lineas','beta_pagos','beta_caja_movimientos','beta_caja_cierres',
    'beta_paquetes','beta_paquete_usos','beta_gift_cards','beta_gift_movimientos','beta_permisos_usuario','beta_ticket_flags','beta_ticket_cancelados','beta_aperturas','beta_paquete_ajustes','beta_multa_tipos','beta_multas','beta_cliente_documentos','beta_credenciales','beta_gift_ajustes','beta_gift_documentos','beta_cliente_alias','beta_oc_cotizaciones','beta_consig_restock','beta_proveedores_ficha','beta_actas','beta_migo_facturas_vivo','beta_migo_importes','beta_cuadre_link','beta_migo_borradores',
    'beta_rol_publicaciones','beta_empleados','beta_iess_descuentos','beta_empleado_docs','beta_roles','beta_roles_log','beta_asistencia_horas_mes','beta_asistencia_horas_log','beta_ticket_snaps',
    'beta_conteo_secciones','beta_conteo_plan','beta_conteo_zonas','erp_sububicaciones','beta_sububicaciones','beta_promociones','beta_consig_precios','beta_portal_cuentas','beta_portal_sesiones','beta_portal_propuestas','beta_rol_descuentos','beta_rol_descuentos_log','beta_rol_firmas','beta_rol_config','beta_rol_config_log','asistencia_historico','beta_iess_planilla'];
  col text; cols text[] := array[]::text[]; exprs text[] := array[]::text[];
  sets text[] := array[]::text[]; wh text[] := array[]::text[]; rec jsonb; q text;
begin
  if coalesce(btrim(p_actor), '') = '' then raise exception 'actor requerido'; end if;
  if p_table in ('beta_stock_movimientos','beta_pagos','beta_caja_movimientos','beta_caja_cierres','beta_paquete_usos','beta_gift_movimientos') and p_op = 'delete' then
    raise exception 'Los movimientos no se borran (se anulan con otro movimiento)';
  end if;
  if not (p_table = any (allowed)) then raise exception 'tabla no permitida: %', p_table; end if;
  if p_op not in ('insert','update','delete') then raise exception 'op invalida'; end if;
  perform set_config('app.user', p_actor, true);
  if p_op = 'insert' then
    for col in select jsonb_object_keys(coalesce(p_row, '{}'::jsonb)) loop
      if col !~ '^[a-z_][a-z0-9_]*$' then raise exception 'columna invalida: %', col; end if;
      if (p_row -> col) = 'null'::jsonb then continue; end if;
      if not exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=p_table and c.column_name=col) then continue; end if;
      cols := cols || quote_ident(col);
      exprs := exprs || format('(jsonb_populate_record(null::public.%I, $1)).%I', p_table, col);
    end loop;
    if coalesce(array_length(cols, 1), 0) = 0 then raise exception 'insert vacio'; end if;
    q := format('insert into public.%I (%s) select %s returning to_jsonb(public.%I.*)', p_table, array_to_string(cols, ','), array_to_string(exprs, ','), p_table);
    execute q using p_row into rec;
    return rec;
  end if;
  if p_match is null or p_match = '{}'::jsonb then raise exception 'update/delete sin filtro'; end if;
  for col in select jsonb_object_keys(p_match) loop
    if col !~ '^[a-z_][a-z0-9_]*$' then raise exception 'columna invalida: %', col; end if;
    wh := wh || format('%I is not distinct from (jsonb_populate_record(null::public.%I, $2)).%I', col, p_table, col);
  end loop;
  if p_op = 'delete' then
    q := format('delete from public.%I where %s returning to_jsonb(public.%I.*)', p_table, array_to_string(wh, ' and '), p_table);
    execute q using null::jsonb, p_match into rec;
    return rec;
  end if;
  for col in select jsonb_object_keys(coalesce(p_row, '{}'::jsonb)) loop
    if col !~ '^[a-z_][a-z0-9_]*$' then raise exception 'columna invalida: %', col; end if;
    if col in ('id') then continue; end if;
    if not exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=p_table and c.column_name=col) then continue; end if;
    sets := sets || format('%I = (jsonb_populate_record(null::public.%I, $1)).%I', col, p_table, col);
  end loop;
  if coalesce(array_length(sets, 1), 0) = 0 then raise exception 'update vacio'; end if;
  q := format('update public.%I set %s where %s returning to_jsonb(public.%I.*)', p_table, array_to_string(sets, ','), array_to_string(wh, ' and '), p_table);
  execute q using p_row, p_match into rec;
  return rec;
end
$function$;
