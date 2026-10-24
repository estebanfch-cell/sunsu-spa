-- 0020_series_pagos.sql — incremental e idempotente. NO va en supabase/migrations.
-- TK-SO en tickets, TK-SQ en cotizaciones.numero, secuencia doc_seq y pago_config.
-- No reescribe stock ni llama erp_importar_legado().
--
--   supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0020_series_pagos.sql

alter table public.tickets add column if not exists so_num text;
create unique index if not exists tickets_so_num_uidx on public.tickets (so_num) where so_num is not null and so_num <> '';

create table if not exists public.doc_seq (
  serie text primary key,
  ultimo int not null default 0
);

create or replace function public.next_doc_num(p_serie text) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if coalesce(btrim(p_serie), '') = '' then raise exception 'serie requerida'; end if;
  insert into public.doc_seq (serie, ultimo) values (p_serie, 1)
  on conflict (serie) do update set ultimo = public.doc_seq.ultimo + 1
  returning ultimo into v;
  return v;
end $$;

revoke all on function public.next_doc_num(text) from public, anon, authenticated;
grant execute on function public.next_doc_num(text) to service_role;

update public.tickets
set so_num = orig->>'so_num'
where coalesce(btrim(so_num), '') = ''
  and coalesce(orig->>'so_num', '') ~ '^TK-SO-[0-9]+$'
  and coalesce(origin, '') <> 'test';

do $$
declare
  rec record;
  seq int;
begin
  select coalesce(max((regexp_match(so_num, '([0-9]+)$'))[1]::int), 0) into seq
  from public.tickets
  where so_num ~ '^TK-SO-[0-9]+$';
  for rec in
    select id from public.tickets
    where coalesce(origin, '') <> 'test'
      and coalesce(so_num, '') !~ '^TK-SO-[0-9]+$'
      and coalesce(orig->>'so_num', '') !~ '^TK-SO-[0-9]+$'
    order by timestamp nulls last, sheet_row nulls last, id
  loop
    seq := seq + 1;
    update public.tickets
    set so_num = 'TK-SO-' || lpad(seq::text, 4, '0'),
        orig = coalesce(orig, '{}'::jsonb) || jsonb_build_object('so_num', 'TK-SO-' || lpad(seq::text, 4, '0'))
    where id = rec.id;
  end loop;
  insert into public.doc_seq (serie, ultimo) values ('TK-SO', seq)
  on conflict (serie) do update set ultimo = greatest(public.doc_seq.ultimo, excluded.ultimo);
end $$;

do $$
declare
  rec record;
  seq int;
begin
  select coalesce(max((regexp_match(numero, '([0-9]+)$'))[1]::int), 0) into seq
  from public.cotizaciones
  where numero ~ '^TK-SQ-[0-9]+$';
  for rec in
    select id from public.cotizaciones
    where coalesce(origin, '') <> 'test'
      and coalesce(numero, '') !~ '^TK-SQ-[0-9]+$'
    order by fecha nulls last, id
  loop
    seq := seq + 1;
    update public.cotizaciones
    set numero = 'TK-SQ-' || lpad(seq::text, 4, '0'),
        orig = coalesce(orig, '{}'::jsonb) || jsonb_build_object('sq_num', 'TK-SQ-' || lpad(seq::text, 4, '0'))
    where id = rec.id;
  end loop;
  insert into public.doc_seq (serie, ultimo) values ('TK-SQ', seq)
  on conflict (serie) do update set ultimo = greatest(public.doc_seq.ultimo, excluded.ultimo);
end $$;

create table if not exists public.pago_config (
  id bigint generated always as identity primary key,
  nombre text not null,
  vigente_desde date not null,
  sueldo numeric not null default 0,
  bono numeric not null default 0,
  iess_pct numeric not null default 0.0945,
  fondo boolean not null default false,
  fondo_desde date,
  vacaciones_desde_anio int not null default 1,
  unique (nombre, vigente_desde)
);

alter table public.pago_config enable row level security;
alter table public.doc_seq enable row level security;

-- app_write de 0018, más pago_config. doc_seq solo se mueve con next_doc_num.
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
    'pago_config','inventario_corte'
  ];
  col text; cols text[] := array[]::text[]; exprs text[] := array[]::text[];
  sets text[] := array[]::text[]; wh text[] := array[]::text[]; rec jsonb; q text;
begin
  if coalesce(btrim(p_actor), '') = '' then raise exception 'actor requerido'; end if;
  if p_table = 'erp_movimientos' and p_op = 'delete' then
    raise exception 'El kardex no se borra';
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
