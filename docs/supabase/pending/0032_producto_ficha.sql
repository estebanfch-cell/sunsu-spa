-- APLICAR en el proyecto Supabase heuolwxyxoezkewyufrl. No poner este archivo en supabase/migrations.
-- 0032: ficha de producto del inventario. Solo columnas nuevas en erp_productos.
-- La función de escritura ya acepta cualquier columna que exista; no hace falta reemplazarla.
--
--   supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0032_producto_ficha.sql
--
-- El bucket "productos" es privado. Si el esquema storage no está, el bloque no hace nada
-- y la API guarda la foto en app_archivos.

alter table public.erp_productos add column if not exists sku_proveedor text;
alter table public.erp_productos add column if not exists linea text;
alter table public.erp_productos add column if not exists observaciones text;

comment on column public.erp_productos.sku_proveedor is 'Código que usa el proveedor. No reemplaza el SKU SUNSU.';
comment on column public.erp_productos.linea is 'Línea comercial del producto.';
comment on column public.erp_productos.observaciones is 'Notas de la ficha. No es un campo de minería ni de inFlow.';

do $$
begin
  insert into storage.buckets (id, name, public)
  values ('productos', 'productos', false)
  on conflict (id) do nothing;
exception when undefined_table or undefined_column then
  null;
end $$;
