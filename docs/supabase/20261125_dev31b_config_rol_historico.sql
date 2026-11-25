-- DEV-31b (Emilia t907u/t908u) · Configuración de rol por empleada + histórico de asistencia propio. Aditivo e idempotente.
-- No borra ni cambia filas existentes. Aplicar con la Management API (database/query).

-- 1) Datos base del rol por empleada (sueldo base, bono, afiliación IESS, fecha de ingreso, activa). Solo admin.
create table if not exists public.beta_rol_config (
  persona text primary key,
  nombre_completo text,
  cedula text,
  cargo text,
  sueldo_base numeric(12,2) not null default 0 check (sueldo_base >= 0),
  bono numeric(12,2) not null default 0 check (bono >= 0),
  afiliada_iess boolean not null default true,
  fecha_ingreso date,
  activa boolean not null default true,
  notas text,
  origin text,
  actualizado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.beta_rol_config is 'Configuración de rol por empleada. Décimos 13º/14º y fondos de reserva siempre mensualizados; el fondo corre desde que cumple 1 año de la fecha de ingreso (8,33 %, primer mes prorrateado).';

create table if not exists public.beta_rol_config_log (
  id text primary key,
  persona text not null,
  accion text not null,
  actor text,
  antes jsonb,
  despues jsonb,
  motivo text,
  origin text,
  created_at timestamptz not null default now()
);
create index if not exists beta_rol_config_log_idx on public.beta_rol_config_log (persona, created_at);

-- 2) Histórico de asistencia de la propia app: días 1–19 nov 2026 que venían del importador anterior, copiados tal cual.
--    Desde ahora la asistencia sale solo de asistencia_marcajes + este histórico congelado (nadie lo importa más).
create table if not exists public.asistencia_historico (
  id bigserial primary key,
  persona text not null,
  person_id text,
  fecha date not null,
  payroll_minutes numeric,
  supplementary_minutes numeric,
  extraordinary_minutes numeric,
  rest_day_minutes numeric,
  origen text not null default 'historico_2026-11',
  imported_at timestamptz not null default now(),
  unique (persona, fecha)
);
comment on table public.asistencia_historico is 'Días de asistencia anteriores al 20/11/2026 (cuando empezaron las marcas de la app). Congelado: no se importa nada nuevo.';
insert into public.asistencia_historico (persona, person_id, fecha, payroll_minutes, supplementary_minutes, extraordinary_minutes, rest_day_minutes)
  select persona, person_id::text, fecha, payroll_minutes, supplementary_minutes, extraordinary_minutes, rest_day_minutes
  from public.jibble_historial where fecha <= date '2026-11-19'
  on conflict (persona, fecha) do nothing;

alter table public.beta_rol_config enable row level security;
alter table public.beta_rol_config_log enable row level security;
alter table public.asistencia_historico enable row level security;
grant select, insert, update, delete on public.beta_rol_config, public.beta_rol_config_log, public.asistencia_historico to sunsu_admin, service_role;
grant usage, select on sequence public.asistencia_historico_id_seq to sunsu_admin, service_role;
do $$
begin
  execute 'drop policy if exists p_admin on public.beta_rol_config';
  execute 'create policy p_admin on public.beta_rol_config for all to sunsu_admin using (true) with check (true)';
  execute 'drop policy if exists p_admin on public.beta_rol_config_log';
  execute 'create policy p_admin on public.beta_rol_config_log for all to sunsu_admin using (true) with check (true)';
  execute 'drop policy if exists p_admin on public.asistencia_historico';
  execute 'create policy p_admin on public.asistencia_historico for all to sunsu_admin using (true) with check (true)';
end $$;

-- 3) Semilla con los valores confirmados por Emilia (sueldo base 482; bonos Alejandra 30, Andrea 130, Daniela 130; Evelyn sin IESS).
insert into public.beta_rol_config (persona, nombre_completo, cedula, cargo, sueldo_base, bono, afiliada_iess, fecha_ingreso, activa, notas, origin, actualizado_por)
select r.nombre_app, r.apellidos_y_nombres, r.cedula::numeric::bigint::text, r.cargo,
       482, case r.nombre_app when 'Alejandra' then 30 when 'Andrea' then 130 when 'Daniela' then 130 else 0 end,
       case when r.nombre_app = 'Evelyn' then false else true end,
       r.fecha_ingreso::date, true, 'Semilla DEV-31b (Emilia t907u)', 'beta', 'Grok Bot'
from public.rrhh_empleadas r
where r.nombre_app in ('Alejandra','Andrea','Daniela','Evelyn')
on conflict (persona) do nothing;
-- Dejaneira ya no trabaja en Sunsu: queda inactiva (sus datos no se borran; ya figura en personal_bajas).
insert into public.beta_rol_config (persona, nombre_completo, cedula, cargo, sueldo_base, bono, afiliada_iess, fecha_ingreso, activa, notas, origin, actualizado_por)
values ('Dejaneira', 'Dejaneira Espinoza', '1725502312', null, 0, 0, true, null, false, 'Ya no trabaja en Sunsu (Emilia t907u). Inactiva.', 'beta', 'Grok Bot')
on conflict (persona) do nothing;

-- 4) app_beta_write: misma función en vivo + beta_rol_config, beta_rol_config_log y asistencia_historico.
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
    'beta_conteo_secciones','beta_conteo_plan','beta_conteo_zonas','erp_sububicaciones','beta_sububicaciones','beta_promociones','beta_consig_precios','beta_portal_cuentas','beta_portal_sesiones','beta_portal_propuestas','beta_rol_descuentos','beta_rol_descuentos_log','beta_rol_firmas','beta_rol_config','beta_rol_config_log','asistencia_historico'];
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
