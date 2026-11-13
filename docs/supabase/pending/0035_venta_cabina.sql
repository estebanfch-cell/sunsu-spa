-- Venta desde Cabina: máscaras Dr.esthe / Esthemax ML-009…014.
-- Ya están pagadas y se usan en cabina. El ticket descuenta la bodega Cabina,
-- no la percha de Venta, y no entran a consignación ni al restock del proveedor.
-- Siguen activas en el catálogo.
--
-- Aditiva: una columna nueva y un update de esas seis filas si ya existen.
-- No inserta productos, no borra historial y no toca otras bodegas.
-- El default de un producto sin esta columna sigue siendo la bodega Venta
-- (11111111-1111-4111-8111-111111111111).
--
-- Aplicar en el proyecto heuolwxyxoezkewyufrl. No despliega la función.
--   supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0035_venta_cabina.sql
--
-- Requiere las bodegas de 0009 (Venta y Cabina).

alter table public.erp_productos
  add column if not exists bodega_origen_venta uuid references public.erp_bodegas(id);

comment on column public.erp_productos.bodega_origen_venta is
  'Bodega de la que descuenta un ticket. Null = Venta. Cabina (22222222-2222-4222-8222-222222222222) = ya pagado, fuera de consignación y de la percha.';

-- Uso ambos: vender() rechaza uso cabina, y el trigger de stock rechaza uso venta en Cabina.
update public.erp_productos
set bodega_origen_venta = '22222222-2222-4222-8222-222222222222',
    uso = 'ambos',
    activo = true
where regexp_replace(upper(sku), '^SUNSU-', '') in
  ('ML-009', 'ML-010', 'ML-011', 'ML-012', 'ML-013', 'ML-014');
