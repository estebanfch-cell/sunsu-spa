-- Compra comisión: solo entra al cálculo de la comisión de producto.
-- La compra real sigue en inventario_base.compra y alimenta la utilidad.
-- No se aplica sola: es aditiva y no reescribe columnas que ya existen.
--   supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0034_catalogo_compra_comision.sql

alter table public.catalogo add column if not exists compra_comision numeric;

comment on column public.catalogo.compra_comision is
  'Costo usado solo para la comisión (PCT_COMISION_PRODUCTO del margen). No es la compra real.';
