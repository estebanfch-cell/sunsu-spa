-- APLICAR en el proyecto Supabase heuolwxyxoezkewyufrl. No poner este archivo en supabase/migrations.
-- 0030: flujo continuo de Compras. Solo columnas y tablas nuevas.
-- No borra filas, no cambia el estado viejo (abierta / parcial / recibida) y no toca hojas.
--
--   supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0030_compras_flujo.sql
--
-- El bucket de facturas del proveedor se llama "compras" (privado). Si el esquema storage
-- no está en esta base, el bloque de abajo no hace nada y la API guarda el archivo en app_archivos.

alter table public.erp_oc add column if not exists flujo text;
comment on column public.erp_oc.flujo is 'Borrador, Aprobada, Enviada, Recibida parcial, Recibida, Pagada parcial, Pagada/Cerrada. El estado viejo (abierta/parcial/recibida) se conserva.';

alter table public.erp_oc_lineas add column if not exists no_recibido numeric not null default 0;
comment on column public.erp_oc_lineas.no_recibido is 'Unidades marcadas No recibido. recibido + no_recibido cierra la línea.';

create table if not exists public.erp_oc_pagos (
  id uuid primary key default gen_random_uuid(),
  oc_id uuid,
  monto numeric(12,2) not null,
  fecha date,
  nota text,
  archivo_id text,
  archivo_nombre text,
  storage_path text,
  actor text,
  origin text,
  created_at timestamptz not null default now()
);
create index if not exists erp_oc_pagos_oc_idx on public.erp_oc_pagos (oc_id, created_at);

create table if not exists public.erp_consignacion_cierre (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid,
  oc_id uuid,
  sku text,
  qty numeric not null,
  monto numeric(12,2) not null,
  fecha_venta date,
  ticket_ref text,
  pago_id uuid,
  origin text,
  created_at timestamptz not null default now()
);
create index if not exists erp_consig_cierre_prov_idx on public.erp_consignacion_cierre (proveedor_id, fecha_venta);

alter table public.erp_oc_pagos add column if not exists origin text;
alter table public.erp_consignacion_cierre add column if not exists origin text;

alter table public.erp_oc_pagos enable row level security;
alter table public.erp_consignacion_cierre enable row level security;

-- prueba_purgar es el de 0029 más estas dos tablas. Solo borra origin = 'test'.
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
    'erp_oc_pagos','erp_consignacion_cierre'
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

do $$
begin
  insert into storage.buckets (id, name, public)
  values ('compras', 'compras', false)
  on conflict (id) do nothing;
exception when undefined_table or undefined_column then
  null;
end $$;

-- app_write es el de 0024 más erp_oc_pagos y erp_consignacion_cierre.
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
    'erp_oc_pagos','erp_consignacion_cierre'
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
