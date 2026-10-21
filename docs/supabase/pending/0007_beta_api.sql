-- 0007_beta_api.sql — incremental, idempotente. NO está en supabase/migrations.
-- Aplicar UNA vez desde la máquina del coordinador (el esquema 0001–0006 ya está cargado):
--   supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0007_beta_api.sql
--
-- Crea cuentas, sesiones, memoria (lo que vivía en Script Properties), archivos de la beta,
-- saldo inicial de percha (la hoja 📊 INVENTARIO no se migró), órdenes/bajas de cabina,
-- y la RPC app_write que fija app.user en la MISMA transacción que el cambio
-- para que audit_log (0006) registre al usuario del app y no a service_role.

-- ── Usuarios (el PIN no está en las hojas: se valida contra el Apps Script la primera vez) ──
create table if not exists public.usuarios (
  id text primary key,
  nombre text not null,
  short text,
  rol text not null check (rol in (
    'super_admin','admin','admin_master','gerente','recepcion','reception',
    'cosmetologa','asistente_cosmetologia','staff'
  )),
  color text,
  pin_hash text,
  pin_salt text,
  pin_reset boolean not null default false,
  bloqueado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.usuarios enable row level security;
comment on table public.usuarios is 'Respaldo offline. El login de producción usa app_usuarios + verificar_pin (0008), no esta tabla. es_cosmetologa NO vive aquí: el N de paquetes lee cosmetologas.es_cosmetologa.';

insert into public.usuarios (id, nombre, short, rol, color) values
  ('efch','EFCH','EFCH','super_admin','#3D5A7A'),
  ('emi','Emi','Emi','admin','#8FA8C8'),
  ('andrea','Andrea Robles','Andrea','cosmetologa','#5B7FA6'),
  ('daniela','Daniela Mora','Daniela','cosmetologa','#C4943A'),
  ('dejaneira','Dejaneira Espinoza','Dejaneira','asistente_cosmetologia','#7A9E8A'),
  ('alejandra','Alejandra Rodriguez','Alejandra','recepcion','#D4956A')
on conflict (id) do nothing;

create table if not exists public.sesiones (
  token text primary key,
  uid text not null references public.usuarios(id) on delete cascade,
  rol text not null,
  exp timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.sesiones enable row level security;
create index if not exists sesiones_uid_idx on public.sesiones (uid);

-- Memoria que antes vivía en Script Properties (seguimiento, GC digitales, contador TK, fotos).
create table if not exists public.app_kv (
  clave text primary key,
  valor jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_kv enable row level security;

-- Comprobantes y fotos nuevas de la beta (Drive sigue siendo la fuente de las URLs ya guardadas).
create table if not exists public.app_archivos (
  id text primary key,
  kind text not null,
  nombre text,
  mime text,
  data_b64 text,
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.app_archivos enable row level security;

-- Stock inicial de percha. La pestaña 📊 INVENTARIO no está en el espejo (solo sus fórmulas).
-- stock = stock_inicial + entradas recibidas (sin COMPRA DIRECTA) − ventas desde 2026-05-22.
-- Mientras stock_inicial sea 0 el número NO coincide con la hoja. Cargar los saldos reales aquí.
create table if not exists public.inventario_base (
  sku text primary key,
  stock_inicial numeric not null default 0,
  minimo numeric not null default 0,
  compra numeric,
  updated_at timestamptz not null default now()
);
alter table public.inventario_base enable row level security;

-- Hojas de cabina que el Apps Script crea al vuelo y el espejo todavía no trae.
create table if not exists public.cabina_ordenes (
  id bigserial primary key,
  sheet_row integer not null unique,
  num text,
  fecha text,
  proveedor text,
  items text,
  estado text,
  total numeric,
  por text,
  recibida text,
  recibida_por text,
  orig jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cabina_ordenes enable row level security;

create table if not exists public.cabina_bajas (
  id bigserial primary key,
  sheet_row integer not null unique,
  num text,
  fecha text,
  tipo text,
  codigo text,
  nombre text,
  cantidad text,
  razon text,
  por text,
  foto text,
  orig jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cabina_bajas enable row level security;

-- ── Escritura con actor (audit_log lee set_config('app.user') dentro de la transacción) ──
create or replace function public.app_write(
  p_actor text,
  p_table text,
  p_op text,
  p_match jsonb,
  p_row jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    'cosmetologas','ciclo_override','config_comisiones'
  ];
  col text;
  cols text[] := array[]::text[];
  exprs text[] := array[]::text[];
  sets text[] := array[]::text[];
  wh text[] := array[]::text[];
  rec jsonb;
  q text;
begin
  if coalesce(btrim(p_actor), '') = '' then
    raise exception 'actor requerido';
  end if;
  if not (p_table = any (allowed)) then
    raise exception 'tabla no permitida: %', p_table;
  end if;
  if p_op not in ('insert','update','delete') then
    raise exception 'op invalida';
  end if;
  perform set_config('app.user', p_actor, true);

  if p_op = 'insert' then
    for col in select jsonb_object_keys(coalesce(p_row, '{}'::jsonb)) loop
      if col !~ '^[a-z_][a-z0-9_]*$' then raise exception 'columna invalida: %', col; end if;
      if (p_row -> col) = 'null'::jsonb then continue; end if;
      if not exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = p_table and c.column_name = col
      ) then continue; end if;
      cols := cols || quote_ident(col);
      exprs := exprs || format('(jsonb_populate_record(null::public.%I, $1)).%I', p_table, col);
    end loop;
    if coalesce(array_length(cols, 1), 0) = 0 then
      raise exception 'insert vacio';
    end if;
    q := format('insert into public.%I (%s) select %s returning to_jsonb(public.%I.*)',
      p_table, array_to_string(cols, ','), array_to_string(exprs, ','), p_table);
    execute q using p_row into rec;
    return rec;
  end if;

  if p_match is null or p_match = '{}'::jsonb then
    raise exception 'update/delete sin filtro';
  end if;
  for col in select jsonb_object_keys(p_match) loop
    if col !~ '^[a-z_][a-z0-9_]*$' then raise exception 'columna invalida: %', col; end if;
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = p_table and c.column_name = col
    ) then raise exception 'filtro desconocido: %', col; end if;
    wh := wh || format('%I is not distinct from (jsonb_populate_record(null::public.%I, $2)).%I', col, p_table, col);
  end loop;

  if p_op = 'delete' then
    q := format('delete from public.%I where %s returning to_jsonb(public.%I.*)',
      p_table, array_to_string(wh, ' and '), p_table);
    execute q using null::jsonb, p_match into rec;
    return rec;
  end if;

  for col in select jsonb_object_keys(coalesce(p_row, '{}'::jsonb)) loop
    if col !~ '^[a-z_][a-z0-9_]*$' then raise exception 'columna invalida: %', col; end if;
    if col = 'id' then continue; end if;
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = p_table and c.column_name = col
    ) then continue; end if;
    sets := sets || format('%I = (jsonb_populate_record(null::public.%I, $1)).%I', col, p_table, col);
  end loop;
  if coalesce(array_length(sets, 1), 0) = 0 then
    raise exception 'update vacio';
  end if;
  q := format('update public.%I set %s where %s returning to_jsonb(public.%I.*)',
    p_table, array_to_string(sets, ','), array_to_string(wh, ' and '), p_table);
  execute q using p_row, p_match into rec;
  return rec;
end $$;

revoke all on function public.app_write(text, text, text, jsonb, jsonb) from public;
revoke all on function public.app_write(text, text, text, jsonb, jsonb) from anon, authenticated;
grant execute on function public.app_write(text, text, text, jsonb, jsonb) to service_role;

-- Reengancha la auditoría a las tablas nuevas (y a las que ya existían).
select public.audit_attach_all();
