-- TK202: bodega por línea en el conteo físico (Venta y kardex Consignación en el mismo conteo).
-- SOLO AGREGA la columna. No toca filas, no mueve stock.
alter table public.beta_conteo_lineas add column if not exists bodega text;
comment on column public.beta_conteo_lineas.bodega is 'Bodega de la línea: CONSIGNACION (Venta), BCONSIG (kardex Consignación), CABINA u OFICINA. Si es null, se usa la bodega del conteo.';
