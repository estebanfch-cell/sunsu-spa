-- 0017_lugares.sql — idempotente. NO está en supabase/migrations.
-- APLICAR con:
--   supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0017_lugares.sql
--
-- No mueve cantidades. El saldo de VENTA sigue en Venta (La Esquina).
-- El saldo de CABINA sigue en Cabina 1. Casa, Cabina 2 y Cabina 3 arrancan en cero.
-- El conteo físico corrige después, con un ajuste en el kardex.
-- 0016 sigue pendiente si Modo prueba todavía no está encendido. Este archivo no lo reemplaza.
-- Si 0016 se aplica después, su lista de purga ya incluye estas tablas.

create table if not exists public.erp_locales (
  id uuid primary key,
  codigo text unique not null,
  nombre text not null,
  direccion text not null default '',
  activo boolean not null default true,
  origin text
);

alter table public.erp_bodegas add column if not exists local_id uuid references public.erp_locales(id);
alter table public.erp_bodegas add column if not exists orden int not null default 0;

alter table public.erp_bodegas drop constraint if exists erp_bodegas_tipo_check;
alter table public.erp_bodegas add constraint erp_bodegas_tipo_check
  check (tipo in ('cabina', 'venta', 'casa', 'ubicacion'));

insert into public.erp_locales (id, codigo, nombre, direccion) values
  ('33333333-3333-4333-8333-333333333333', 'ESQUINA', 'La Esquina', 'C.C. La Esquina, Cumbayá')
on conflict (codigo) do update set
  nombre = excluded.nombre,
  direccion = excluded.direccion;

insert into public.erp_bodegas (id, codigo, nombre, tipo, local_id, orden) values
  ('44444444-4444-4444-8444-444444444444', 'CASA', 'Casa', 'casa', null, 0),
  ('55555555-5555-4555-8555-555555555552', 'CAB2', 'Cabina 2', 'cabina', '33333333-3333-4333-8333-333333333333', 3),
  ('55555555-5555-4555-8555-555555555553', 'CAB3', 'Cabina 3', 'cabina', '33333333-3333-4333-8333-333333333333', 4)
on conflict (codigo) do nothing;

update public.erp_bodegas
set local_id = '33333333-3333-4333-8333-333333333333', orden = 1
where codigo = 'VENTA';

update public.erp_bodegas
set local_id = '33333333-3333-4333-8333-333333333333',
    orden = 2,
    nombre = case when nombre in ('Cabina', 'CABINA') then 'Cabina 1' else nombre end
where codigo = 'CABINA';

alter table public.sesiones add column if not exists local_id uuid;

create table if not exists public.erp_consignacion_consumo (
  id uuid primary key default gen_random_uuid(),
  transferencia_id uuid,
  producto_id uuid,
  sku text not null,
  cantidad numeric not null,
  costo_unit numeric(12,4) not null default 0,
  quincena_ini date,
  quincena_fin date,
  familia text,
  bodega_id uuid,
  creado_por text,
  fecha timestamptz not null default now(),
  nota text,
  origin text
);
create index if not exists erp_consig_consumo_q_idx
  on public.erp_consignacion_consumo (familia, quincena_ini, quincena_fin);

create or replace function public.erp_chk_uso() returns trigger language plpgsql as $$
declare u text; t text;
begin
  select uso into u from public.erp_productos where id = new.producto_id;
  select tipo into t from public.erp_bodegas where id = new.bodega_id;
  if u is null or t is null then return new; end if;
  if t in ('casa', 'ubicacion') then return new; end if;
  if u = 'ambos' and t in ('cabina', 'venta') then return new; end if;
  if u <> t then
    raise exception 'Producto de uso % no puede ir a bodega %', u, t;
  end if;
  return new;
end $$;

insert into public.app_modulos (rol, modulo, acceso) values
  ('cosmetologa', 'transferencias', 'todos')
on conflict (rol, modulo) do update set acceso = excluded.acceso;

-- Lista blanca = 0015 más locales y el consumo de consignación a cabina.
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
    'gift_card_movimientos','erp_locales','erp_consignacion_consumo'
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

alter table public.erp_locales enable row level security;
alter table public.erp_consignacion_consumo enable row level security;
drop policy if exists p_staff on public.erp_locales;
drop policy if exists p_staff on public.erp_consignacion_consumo;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sunsu_rls') then
    execute $p$ create policy p_staff on public.erp_locales for select to sunsu_rls using (true) $p$;
    execute $p$ create policy p_staff on public.erp_consignacion_consumo for select to sunsu_rls using (public.app_acceso('compras') <> 'no' or public.app_acceso('inventario') <> 'no') $p$;
  end if;
end $$;
