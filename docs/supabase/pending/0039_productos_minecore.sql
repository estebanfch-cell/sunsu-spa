-- APLICAR en el proyecto Supabase heuolwxyxoezkewyufrl. Solo agrega: no borra, no mueve stock, no reemplaza vistas.
--   supabase db query --linked --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0039_productos_minecore.sql
--
-- 0039: Productos estilo MineCore.
--  1. Respaldo de erp_stock y erp_bodegas (copia de tabla) antes de cualquier cambio de bodegas.
--  2. erp_sububicaciones: Bodega Cabina (CABINA) con Cabina 1/2/3. CAB2/CAB3 siguen existiendo y la API
--     las muestra como Cabina 2/3 (compatibilidad: tickets, aperturas, sync y dashboard no cambian).
--  3. erp_bodega_grupos: etiqueta de cada bodega actual en la vista nueva (Consignación <- VENTA,
--     Bodega Cabina <- CABINA/CAB2/CAB3, Bodega Oficina <- CASA). Solo etiquetas.
--  4. Columnas de la ficha en erp_productos. Los precios editados en la beta van a beta_* para que el
--     sync horario Sheets -> catalogo no los pise. catalogo y la hoja no se tocan.
--  5. erp_producto_cambios(p_id): historial de cambios de la ficha desde audit_log.

create table if not exists public.erp_stock_bk_20261116 as select * from public.erp_stock;
create table if not exists public.erp_bodegas_bk_20261116 as select * from public.erp_bodegas;
alter table public.erp_stock_bk_20261116 enable row level security;
alter table public.erp_bodegas_bk_20261116 enable row level security;

create table if not exists public.erp_sububicaciones (
  id uuid primary key default gen_random_uuid(),
  bodega_id uuid not null references public.erp_bodegas(id),
  codigo text not null,
  nombre text not null,
  orden int not null default 0,
  activo boolean not null default true,
  legacy_bodega_id uuid references public.erp_bodegas(id),
  created_at timestamptz not null default now(),
  unique (bodega_id, codigo)
);
alter table public.erp_sububicaciones enable row level security;
comment on table public.erp_sububicaciones is 'Sububicaciones por bodega (MineCore). Bodega Cabina = CABINA con Cabina 1/2/3. legacy_bodega_id = bodega vieja que hoy representa esa sububicación (CAB2/CAB3).';

insert into public.erp_sububicaciones (bodega_id, codigo, nombre, orden, legacy_bodega_id)
select '22222222-2222-4222-8222-222222222222', v.codigo, v.nombre, v.orden, v.legacy::uuid
from (values
  ('CABINA_1', 'Cabina 1', 1, null),
  ('CABINA_2', 'Cabina 2', 2, '55555555-5555-4555-8555-555555555552'),
  ('CABINA_3', 'Cabina 3', 3, '55555555-5555-4555-8555-555555555553')
) as v(codigo, nombre, orden, legacy)
where exists (select 1 from public.erp_bodegas where id = '22222222-2222-4222-8222-222222222222')
  and (v.legacy is null or exists (select 1 from public.erp_bodegas where id = v.legacy::uuid))
on conflict (bodega_id, codigo) do nothing;

create table if not exists public.erp_bodega_grupos (
  bodega_id uuid primary key references public.erp_bodegas(id),
  grupo text not null,
  grupo_nombre text not null,
  sububicacion text,
  nota text
);
alter table public.erp_bodega_grupos enable row level security;
comment on table public.erp_bodega_grupos is 'Etiqueta de cada bodega actual en Productos. No mueve stock. Pendiente de Emilia: qué stock pasa a qué bodega.';

insert into public.erp_bodega_grupos (bodega_id, grupo, grupo_nombre, sububicacion, nota)
select v.id::uuid, v.grupo, v.nombre, v.sub, v.nota
from (values
  ('11111111-1111-4111-8111-111111111111', 'CONSIGNACION', 'Consignación', null, 'VENTA = inventario principal del sistema viejo'),
  ('22222222-2222-4222-8222-222222222222', 'CABINA', 'Bodega Cabina', null, 'Stock sin sububicación = sin cabina asignada'),
  ('55555555-5555-4555-8555-555555555552', 'CABINA', 'Bodega Cabina', 'CABINA_2', 'CAB2 se muestra como Cabina 2'),
  ('55555555-5555-4555-8555-555555555553', 'CABINA', 'Bodega Cabina', 'CABINA_3', 'CAB3 se muestra como Cabina 3'),
  ('44444444-4444-4444-8444-444444444444', 'OFICINA', 'Bodega Oficina', null, 'CASA = Oficina')
) as v(id, grupo, nombre, sub, nota)
where exists (select 1 from public.erp_bodegas b where b.id = v.id::uuid)
on conflict (bodega_id) do nothing;

alter table public.erp_productos add column if not exists codigo_barras text;
alter table public.erp_productos add column if not exists producto_base text;
alter table public.erp_productos add column if not exists bodega_def text;
alter table public.erp_productos add column if not exists sububicacion_def text;
alter table public.erp_productos add column if not exists foto_thumb text;
alter table public.erp_productos add column if not exists beta_pvp numeric;
alter table public.erp_productos add column if not exists beta_compra_real numeric;
alter table public.erp_productos add column if not exists beta_compra_comision numeric;
alter table public.erp_productos add column if not exists beta_editado_por text;
alter table public.erp_productos add column if not exists beta_editado_at timestamptz;
alter table public.erp_productos add column if not exists beta_precio_motivo text;
comment on column public.erp_productos.beta_pvp is 'PVP con IVA editado en la beta. Null = usa catalogo.total_con_iva. No cambia el sistema viejo ni las comisiones actuales.';
comment on column public.erp_productos.beta_compra_real is 'Compra real editada en la beta. Null = inventario_base.compra / última OC.';
comment on column public.erp_productos.beta_precio_motivo is 'Motivo del último cambio de precio o costo (obligatorio, como MineCore). El historial sale de audit_log.';
comment on column public.erp_productos.beta_compra_comision is 'Compra para comisiones editada en la beta. Null = catalogo.compra_comision o precio_compra.';

create or replace function public.erp_producto_cambios(p_id text)
returns setof public.audit_log
language sql stable security definer set search_path = public as $$
  select * from public.audit_log
  where tabla = 'erp_productos' and fila_id = p_id
  order by ts desc
  limit 200
$$;
revoke all on function public.erp_producto_cambios(text) from public, anon, authenticated;
