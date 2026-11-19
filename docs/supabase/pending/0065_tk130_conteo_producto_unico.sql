-- TK130: un producto aparece una sola vez por conteo.
-- Aditivo: backup primero, se elimina SOLO la línea vacía duplicada de INV-131
-- en CF-001 (sin cantidad y sin sububicación). Se conserva la línea 1-A-1 con
-- cantidad 2. No se toca ninguna otra línea de CF-001 ni de otros conteos.
-- Antes del unique se comprobó que el único duplicado (conteo, producto)
-- era ese par de INV-131 en CF-001.

create table if not exists public._bak_20261119_tk130_cf001_lineas as
select * from public.beta_conteo_lineas
where conteo_id = '5cf84247-f69b-4505-bfb0-5812b780e0e7';

create table if not exists public._bak_20261119_tk130_inv131 as
select * from public.beta_conteo_lineas
where id in (
  '3cd741cb-7f0c-47be-a307-5bfb470ea472',
  'f8628482-76db-45f7-9dae-0a0daab19bcb'
);

delete from public.beta_conteo_lineas
where id = '3cd741cb-7f0c-47be-a307-5bfb470ea472'
  and conteo_id = '5cf84247-f69b-4505-bfb0-5812b780e0e7'
  and producto_id = '49fba662-f3fe-406e-b48b-dddec6f2caf4'
  and sku = 'INV-131'
  and contado is null
  and coalesce(sububicacion, '') = ''
  and coalesce(sub_contada, '') = ''
  and estado = 'pendiente';

create unique index if not exists beta_conteo_lineas_conteo_producto
  on public.beta_conteo_lineas (conteo_id, producto_id);
