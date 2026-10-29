-- 0035: módulo Consignación. Solo tablas nuevas. No se aplica sola.
-- La entrada sube el stock con doc_tipo consignacion y no crea una orden de compra.
-- El cierre del mes crea la OC (flujo Aprobada, estado abierta) solo por lo vendido.
--
--   supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0035_consignacion.sql

create table if not exists public.erp_consignado (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid,
  proveedor_id uuid,
  bodega_id uuid,
  cantidad numeric not null default 0,
  costo numeric not null default 0,
  desde text,
  origin text
);
create unique index if not exists erp_consignado_saldo_uidx
  on public.erp_consignado (producto_id, proveedor_id, bodega_id);
comment on table public.erp_consignado is
  'Saldo consignado por proveedor. No es deuda: el stock físico vive en erp_stock.';

create table if not exists public.erp_consignacion (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  proveedor_id uuid,
  tipo text not null check (tipo in ('entrada', 'pedido', 'cierre')),
  periodo_ini date,
  periodo_fin date,
  estado text not null default 'registrada',
  oc_id uuid,
  nota text,
  creado_por text,
  fecha date,
  subtotal numeric(12,2) default 0,
  iva numeric(12,2) default 0,
  total numeric(12,2) default 0,
  origin text
);
create index if not exists erp_consignacion_prov_idx
  on public.erp_consignacion (proveedor_id, tipo, periodo_ini);

create table if not exists public.erp_consignacion_lineas (
  id uuid primary key default gen_random_uuid(),
  consignacion_id uuid,
  producto_id uuid,
  codigo text,
  nombre text,
  cantidad numeric not null default 0,
  precio numeric(12,4) not null default 0,
  descuento numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null default 0,
  iva numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  clase text,
  orden int default 0,
  origin text
);
create index if not exists erp_consignacion_lineas_doc_idx
  on public.erp_consignacion_lineas (consignacion_id, orden);

alter table public.erp_consignado enable row level security;
alter table public.erp_consignacion enable row level security;
alter table public.erp_consignacion_lineas enable row level security;

drop policy if exists p_staff on public.erp_consignado;
drop policy if exists p_staff on public.erp_consignacion;
drop policy if exists p_staff on public.erp_consignacion_lineas;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sunsu_rls') then
    execute $p$ create policy p_staff on public.erp_consignado for select to sunsu_rls using (public.app_acceso('consignacion') <> 'no') $p$;
    execute $p$ create policy p_staff on public.erp_consignacion for select to sunsu_rls using (public.app_acceso('consignacion') <> 'no') $p$;
    execute $p$ create policy p_staff on public.erp_consignacion_lineas for select to sunsu_rls using (public.app_acceso('consignacion') <> 'no') $p$;
  end if;
end $$;

create or replace function public.prueba_purgar(p_actor text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  tablas text[] := array[
    'tickets','erp_ordenes_venta','erp_ov_lineas','cotizaciones',
    'erp_oc','erp_oc_lineas','erp_recepciones','erp_recepcion_lineas',
    'erp_movimientos','gift_card_movimientos','gift_cards','clientas_registro',
    'asistencia_marcajes','asistencia_auditoria','permisos','paquetes',
    'erp_rfq','erp_rfq_lineas','erp_rfq_prov',
    'erp_transferencias','erp_transferencia_lineas',
    'erp_conteos','erp_conteo_lineas','erp_ajustes','erp_avisos',
    'erp_tickets_procesados','erp_clientes','erp_proveedores','erp_productos',
    'log_acciones','ordenes_compra','caja_chica','propinas','multas_descuentos',
    'app_archivos','cabina_ordenes','roles_aprobados','historial_comisiones',
    'erp_stock','erp_locales','erp_consignacion_consumo',
    'solicitudes_cambio','catalogo','proveedores','inventario_entradas',
    'horarios','horario_dias','horario_descansos','horario_deducciones','horario_asignaciones',
    'erp_oc_pagos','erp_consignacion_cierre',
    'erp_conteo_secciones','erp_conteo_items',
    'erp_consignado','erp_consignacion','erp_consignacion_lineas'
  ];
  t text;
  n int;
  total int := 0;
  counts jsonb := '{}'::jsonb;
  sr int;
begin
  if coalesce(btrim(p_actor), '') = '' then
    raise exception 'actor requerido';
  end if;
  perform set_config('app.user', p_actor, true);
  foreach t in array tablas loop
    if to_regclass('public.' || t) is null then continue; end if;
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = t and c.column_name = 'origin'
    ) then continue; end if;
    execute format('delete from public.%I where origin = %L', t, 'test');
    get diagnostics n = row_count;
    if n > 0 then
      counts := counts || jsonb_build_object(t, n);
      total := total + n;
    end if;
  end loop;
  select coalesce(max(sheet_row), 0) + 1 into sr from public.log_acciones;
  insert into public.log_acciones (sheet_row, fecha, usuario, accion, detalle, orig)
  values (
    sr,
    to_char(now() at time zone 'America/Guayaquil', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    p_actor,
    'PURGA PRUEBA',
    counts::text,
    jsonb_build_object('accion', 'PURGA PRUEBA', 'detalle', counts, 'usuario', p_actor, 'borradas', total)
  );
  return jsonb_build_object('ok', true, 'borradas', total, 'tablas', counts);
end $$;

revoke all on function public.prueba_purgar(text) from public, anon, authenticated;
grant execute on function public.prueba_purgar(text) to service_role;

-- app_write es el de 0031 más erp_consignado, erp_consignacion y erp_consignacion_lineas.
create or replace function public.app_write(
  p_actor text, p_table text, p_op text, p_match jsonb, p_row jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  allowed text[] := array[
    'tickets','clientas_registro','clientas_antiguas','paquetes','gift_cards',
    'historial_ventas','catalogo','inventario_entradas','inventario_fisico',
    'proveedores','ordenes_compra','promos','propinas','envios_tarjetas',
    'roles_aprobados','multas_descuentos','permisos','caja_chica','log_acciones',
    'configuracion','cabina_inventario','cabina_bitacora','cabina_traspasos',
    'cabina_activos','cabina_protocolos','cabina_protocolo_pasos','cabina_consumos',
    'cabina_aperturas','cabina_ordenes','cabina_bajas','rrhh_empleadas','rrhh_historial',
    'cotizaciones','usuarios','sesiones','app_kv','app_archivos','inventario_base',
    'cosmetologas','ciclo_override','config_comisiones','app_modulos','login_intentos',
    'app_usuarios','gift_cards_digitales','seguimiento_memoria','tarjetas_enviadas',
    'wa_enviados','historial_comisiones','cabina_fotos','app_settings',
    'erp_bodegas','erp_productos','erp_producto_bodega','erp_stock','erp_proveedores',
    'erp_clientes','erp_rfq','erp_rfq_prov','erp_rfq_lineas','erp_oc','erp_oc_lineas',
    'erp_recepciones','erp_recepcion_lineas','erp_transferencias','erp_transferencia_lineas',
    'erp_conteos','erp_conteo_lineas','erp_ajustes','erp_ordenes_venta','erp_ov_lineas',
    'erp_tickets_procesados','erp_avisos','erp_servicios','erp_receta','erp_movimientos',
    'asistencia_config','asistencia_marcajes','asistencia_auditoria','asistencia_feriados','jibble_historial',
    'gift_card_movimientos','erp_locales','erp_consignacion_consumo',
    'horarios','horario_dias','horario_descansos','horario_deducciones','horario_asignaciones','push_suscripciones','horario_avisos',
    'pago_config','inventario_corte','solicitudes_cambio','audit_log',
    'erp_oc_pagos','erp_consignacion_cierre',
    'erp_conteo_secciones','erp_conteo_items',
    'erp_consignado','erp_consignacion','erp_consignacion_lineas'
  ];
  col text; cols text[] := array[]::text[]; exprs text[] := array[]::text[];
  sets text[] := array[]::text[]; wh text[] := array[]::text[]; rec jsonb; q text;
begin
  if coalesce(btrim(p_actor), '') = '' then raise exception 'actor requerido'; end if;
  if p_table = 'erp_movimientos' and p_op = 'delete' then
    raise exception 'El kardex no se borra';
  end if;
  if p_table = 'audit_log' and p_op <> 'insert' then
    raise exception 'audit_log solo acepta insert';
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
end $$;

revoke all on function public.app_write(text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.app_write(text, text, text, jsonb, jsonb) to service_role;
