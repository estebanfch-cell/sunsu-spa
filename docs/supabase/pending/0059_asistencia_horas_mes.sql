-- 0059: historial mensual de horas de asistencia (dashboard TK89).
-- SOLO AGREGA tablas, bitácora y las incluye en app_beta_write.
-- No borra ni recorta la lista de tablas permitidas de 0058 (incluye beta_roles y beta_roles_log).

create table if not exists public.beta_asistencia_horas_mes (
  id text primary key,
  nombre text not null,
  anio int not null,
  mes int not null check (mes between 1 and 12),
  min_trabajadas int not null default 0,
  min_normales int not null default 0,
  min_extra50 int not null default 0,
  min_extra100 int not null default 0,
  atraso_min int not null default 0,
  faltas int not null default 0,
  dias_asistidos int not null default 0,
  cerrado boolean not null default false,
  actualizado_por text,
  actualizado_at timestamptz not null default now(),
  unique (nombre, anio, mes)
);
comment on table public.beta_asistencia_horas_mes is 'Resumen mensual de horas trabajadas por persona (sin datos de contacto). Un mes cerrado no se recalcula al pasar al siguiente, se conserva como historial.';

create table if not exists public.beta_asistencia_horas_log (
  id bigserial primary key,
  nombre text,
  anio int,
  mes int,
  min_trabajadas int,
  cerrado boolean,
  accion text not null,
  por text,
  created_at timestamptz not null default now()
);
comment on table public.beta_asistencia_horas_log is 'Bitácora de altas/actualizaciones del historial de horas. Sin datos de contacto.';

create index if not exists beta_asistencia_horas_mes_periodo_idx
  on public.beta_asistencia_horas_mes (anio, mes);

alter table public.beta_asistencia_horas_mes enable row level security;
alter table public.beta_asistencia_horas_log enable row level security;

grant select, insert, update, delete, references, trigger, truncate
  on public.beta_asistencia_horas_mes, public.beta_asistencia_horas_log to service_role;
grant usage, select on sequence public.beta_asistencia_horas_log_id_seq to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sunsu_admin') then
    grant select on public.beta_asistencia_horas_mes, public.beta_asistencia_horas_log to sunsu_admin;
    execute 'drop policy if exists p_admin on public.beta_asistencia_horas_mes';
    execute 'create policy p_admin on public.beta_asistencia_horas_mes for all to sunsu_admin using (true) with check (true)';
    execute 'drop policy if exists p_admin on public.beta_asistencia_horas_log';
    execute 'create policy p_admin on public.beta_asistencia_horas_log for all to sunsu_admin using (true) with check (true)';
  end if;
end $$;

-- Lista de 0054, más las dos tablas nuevas. No se quita ninguna.
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
    'beta_rol_publicaciones','beta_empleados','beta_iess_descuentos','beta_empleado_docs','beta_roles','beta_roles_log','beta_asistencia_horas_mes','beta_asistencia_horas_log'];
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

revoke all on function public.app_beta_write(text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.app_beta_write(text, text, text, jsonb, jsonb) to service_role;
