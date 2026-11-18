-- 0051_staff_roles_asistencia.sql — incremental e idempotente.
-- Publicación de roles de pago (el personal solo ve los que el admin publica),
-- feriados oficiales Ecuador 2026 y nombre del local en la geocerca.
--
--   supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0051_staff_roles_asistencia.sql

create table if not exists public.beta_rol_publicaciones (
  id uuid primary key default gen_random_uuid(),
  periodo text not null,
  persona text not null default '*',
  publicado boolean not null default false,
  publicado_por text,
  publicado_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (periodo, persona)
);
comment on table public.beta_rol_publicaciones is 'Un admin publica o oculta un rol por periodo (MAYO_2026 o CICLO_2026-09-26). persona=* aplica a todas; una fila por persona sobrescribe.';
create index if not exists beta_rol_publicaciones_periodo_idx on public.beta_rol_publicaciones (periodo);

alter table public.beta_rol_publicaciones enable row level security;
grant select, insert, update, delete on public.beta_rol_publicaciones to sunsu_admin, sunsu_rls, service_role;

do $$
begin
  execute 'drop policy if exists p_admin on public.beta_rol_publicaciones';
  execute 'create policy p_admin on public.beta_rol_publicaciones for all to sunsu_admin using (true) with check (true)';
  execute 'drop policy if exists p_staff on public.beta_rol_publicaciones';
  execute $p$ create policy p_staff on public.beta_rol_publicaciones for select to sunsu_rls using (publicado = true) $p$;
end $$;

alter table public.asistencia_config add column if not exists lugar_nombre text not null default 'C.C. La Esquina';
comment on column public.asistencia_config.lugar_nombre is 'Nombre del local de la geocerca, p. ej. C.C. La Esquina.';

alter table public.asistencia_feriados add column if not exists fuente text;
alter table public.asistencia_feriados add column if not exists traslado_de date;

-- Feriados nacionales 2026. Fuentes:
-- * Viceministerio de Turismo, calendario oficial 2025–2030 (publicado 1 sep 2025).
-- * Código del Trabajo art. 65 y Ley Orgánica Reformatoria (traslados: martes→lunes, mié/jue→viernes, sáb/dom→vie o lun).
--   No se trasladan: 1 de enero, 25 de diciembre ni el martes de Carnaval.
-- * Decreto Ejecutivo 354 (Registro Oficial, Tercer Suplemento Nº 258): suspende el 30 de abril de 2026 (no recuperable) y lo une al 1 de mayo.
insert into public.asistencia_feriados (fecha, nombre, fuente, traslado_de) values
  ('2026-01-01', 'Año Nuevo', 'Viceministerio de Turismo, calendario 2025-2030', null),
  ('2026-02-16', 'Carnaval', 'Viceministerio de Turismo, calendario 2025-2030', null),
  ('2026-02-17', 'Carnaval', 'Viceministerio de Turismo, calendario 2025-2030', null),
  ('2026-04-03', 'Viernes Santo', 'Viceministerio de Turismo, calendario 2025-2030', null),
  ('2026-04-30', 'Suspensión de jornada (Día del Trabajo)', 'Decreto Ejecutivo 354, R.O. 3er Supl. 258', null),
  ('2026-05-01', 'Día del Trabajo', 'Viceministerio de Turismo, calendario 2025-2030', null),
  ('2026-05-25', 'Batalla de Pichincha', 'Viceministerio de Turismo; traslado art. 65 C.T. (el 24 cae domingo)', '2026-05-24'),
  ('2026-08-10', 'Primer Grito de la Independencia', 'Viceministerio de Turismo, calendario 2025-2030', null),
  ('2026-10-09', 'Independencia de Guayaquil', 'Viceministerio de Turismo, calendario 2025-2030', null),
  ('2026-11-02', 'Día de los Difuntos', 'Viceministerio de Turismo, calendario 2025-2030', null),
  ('2026-11-03', 'Independencia de Cuenca', 'Viceministerio de Turismo, calendario 2025-2030', null),
  ('2026-12-25', 'Navidad', 'Viceministerio de Turismo, calendario 2025-2030', null)
on conflict (fecha) do update set
  nombre = excluded.nombre,
  fuente = coalesce(public.asistencia_feriados.fuente, excluded.fuente),
  traslado_de = coalesce(public.asistencia_feriados.traslado_de, excluded.traslado_de);

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
    'beta_rol_publicaciones'];
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

-- Salida automática (origen nuevo). No borra marcas; el admin puede corregir.
alter table public.asistencia_marcajes drop constraint if exists asistencia_marcajes_origen_check;
alter table public.asistencia_marcajes add constraint asistencia_marcajes_origen_check
  check (origen in ('telefono','recepcion','manual','automatica'));
alter table public.asistencia_marcajes drop constraint if exists asistencia_marcajes_manual_motivo;
alter table public.asistencia_marcajes add constraint asistencia_marcajes_manual_motivo
  check (origen not in ('manual','automatica') or coalesce(btrim(motivo_manual),'') <> '');

-- El cierre lo dispara un cron (edge o pg_cron) cada 15 min, fuera de :00–:15, llamando asis_cierre_automatico.
