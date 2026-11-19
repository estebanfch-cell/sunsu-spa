-- TK135: al aprobar un conteo físico, el stock real de Productos de esa
-- bodega se actualiza con las líneas que sí se contaron. Aditivo: backups
-- primero. No se reescriben las líneas de CF-001, no se toca cabina_inventario
-- ni las cantidades de erp_stock (Productos = stock del sistema + movimientos
-- beta; escribir el mismo delta en erp_stock CASA duplicaría Bodega Oficina).
--
-- Emilia confirmó el 19/11/2026 14:18 (America/Guayaquil): aprobar debe
-- actualizar el stock, y el CF-001 (Bodega Oficina, aprobado 13:05) debe
-- quedar reflejado ahora.
--
-- CF-001: 32 líneas, 30 contadas, 2 pendientes que se dejan igual
-- (INV-062 (sistema 2, estado pendiente), INV-067 (sistema 1, estado pendiente)).
-- De las 30 contadas, 5 ya coincidían con el sistema
-- (INV-071=1, INV-076=1, INV-081=2, INV-083=2, INV-089=11): no hay movimiento.
-- Se aplican 25 diferencias, dueño sunsu (Oficina),
-- con la sububicación de la línea cuando existe (p. ej. INV-131 en 1-A-1).
-- Idempotente: si ya hay movimientos tipo conteo de CF-001 o stock_aplicado,
-- no se vuelve a insertar.

create table if not exists public._bak_20261119_tk135_erp_stock as table public.erp_stock;
create table if not exists public._bak_20261119_tk135_erp_movimientos as table public.erp_movimientos;
create table if not exists public._bak_20261119_tk135_beta_stock_movimientos as table public.beta_stock_movimientos;
create table if not exists public._bak_20261119_tk135_beta_conteos as table public.beta_conteos;
create table if not exists public._bak_20261119_tk135_beta_ajustes as table public.beta_ajustes;
create table if not exists public._bak_20261119_tk135_beta_ajuste_lineas as table public.beta_ajuste_lineas;

alter table public._bak_20261119_tk135_erp_stock enable row level security;
alter table public._bak_20261119_tk135_erp_movimientos enable row level security;
alter table public._bak_20261119_tk135_beta_stock_movimientos enable row level security;
alter table public._bak_20261119_tk135_beta_conteos enable row level security;
alter table public._bak_20261119_tk135_beta_ajustes enable row level security;
alter table public._bak_20261119_tk135_beta_ajuste_lineas enable row level security;

alter table public.beta_conteos add column if not exists stock_aplicado_at timestamptz;
comment on column public.beta_conteos.stock_aplicado_at is 'TK135: momento en que el stock real de Productos quedó actualizado con este conteo. Evita aplicar dos veces.';

do $$
declare
  v_conteo_id text := '5cf84247-f69b-4505-bfb0-5812b780e0e7';
  v_numero text := 'CF-001';
  v_ajuste_id text;
  v_ajuste_num text;
  v_now timestamptz := now();
  v_actor text := 'sistema:tk135';
  r record;
begin
  if not exists (
    select 1 from public.beta_conteos
    where id = v_conteo_id and numero = v_numero and estado = 'aprobado'
  ) then
    raise notice 'TK135: CF-001 no está aprobado; no se aplica stock.';
    return;
  end if;

  if exists (
    select 1 from public.beta_conteos
    where id = v_conteo_id and (stock_aplicado is true or stock_aplicado_at is not null)
  ) or exists (
    select 1 from public.beta_stock_movimientos
    where tipo = 'conteo' and (doc_id = v_conteo_id or doc_numero = v_numero)
  ) then
    update public.beta_conteos
       set stock_aplicado = true,
           stock_aplicado_at = coalesce(stock_aplicado_at, v_now),
           updated_at = v_now
     where id = v_conteo_id and stock_aplicado is not true;
    raise notice 'TK135: CF-001 ya tenía stock aplicado; no se duplica.';
    return;
  end if;

  -- INV-062 y INV-067 quedan fuera: están pendientes (no se contaron).
  create temporary table _tk135_cf001 (
    orden int,
    producto_id text,
    sku text,
    nombre text,
    sub text,
    antes numeric,
    despues numeric,
    diferencia numeric
  ) on commit drop;

  insert into _tk135_cf001 (orden, producto_id, sku, nombre, sub, antes, despues, diferencia) values
    (1, '91ea8655-565c-45b1-b665-e2da6d26fa46', 'INV-003', 'SKINFOOD Rice Mask Wash Off', '', 3, 0, -3),
    (2, '7458be00-d772-4cec-a9c9-d1e6bacd474b', 'INV-009', 'Medicube Zero Pore Pads 2.0', '', 1, 0, -1),
    (3, '0fe83c14-b45e-4b1a-9f3c-6b2d6f3a4f79', 'INV-028', 'Daleaf Chlorella Better Root Hair Tonic', '', 4, 0, -4),
    (4, 'a36444c9-47be-4882-81c8-3a9e5a40a064', 'INV-040', 'd''alba Piedmont Italian White Truffle First Spray Serum', '', 1, 0, -1),
    (5, '00430721-7103-4c56-b725-82b27a1413ef', 'INV-061', 'Winner Soft Face Towels', '', 28, 13, -15),
    (6, '429038bf-79df-4425-8513-59ca61d7888c', 'INV-069', 'Pro-Radiance Cream Mask - Dr.esthe', '1-A-1', 0, 1, 1),
    (7, '827e8274-23fd-47d3-aedf-8bfcfb0079ac', 'INV-070', 'O2 Deep Bubble Mask - Dr.esthe', '1-A-1', 4, 3, -1),
    (8, 'f5404fe1-720a-48b6-8f18-5fa89f89bc28', 'INV-073', 'Skin Refining Goat Milk Peel - Dr.esthe', '1-A-1', 1, 2, 1),
    (9, 'c0855b76-92c2-4e99-99f3-51896b43df42', 'INV-074', 'Azulene Relief Solution Ampoule - Dr.esthe', '1-A-1', 2, 1, -1),
    (10, '35ac81eb-db3e-4063-9e12-0aa8350c3f4f', 'INV-075', 'Azulene Relief Solution Ampoule - Dr.esthe', '', 1, 0, -1),
    (11, '204c25a2-ecd3-4d4e-9a90-22569aae71ee', 'INV-078', 'AC Soothing Cream - Dr.esthe', '', 1, 0, -1),
    (12, '5ce3ea67-869f-418e-8681-8afeac3e240e', 'INV-079', 'Sun Protection Ultra Repair for Sensitive Skin - Dr.esthe', '1-A-1', 3, 1, -2),
    (13, '5f387498-8486-4121-bac7-6a465897b921', 'INV-080', 'Cell-Active Dr Booster Solution - Dr.esthe', '', 10, 0, -10),
    (14, 'be5d975a-562f-4829-bf5e-b022be3b8e30', 'INV-082', 'Gold Capsule - Skinbolic', '', 3, 2, -1),
    (15, '5f0dea15-22b4-4f9e-83a9-6071d4618164', 'INV-084', 'Probiotic Skin Balancing Mask - Aroms Natur', '', 2, 1, -1),
    (16, '0d38abd1-b1db-45fa-94e4-7e1f15fc7b75', 'INV-085', 'Crystal Gold Powder - Skinbolic', '', 3, 1, -2),
    (17, 'adc9fec2-86e5-4d76-a2dc-354ad763f16d', 'INV-086', 'Elf Brow lift', '', 4, 5, 1),
    (18, '870ce617-b91b-4681-be14-bdc5f6e3ea85', 'INV-087', 'Brocha de cejas', '', 21, 19, -2),
    (19, 'c8157048-3c2b-4c0b-8d46-78d0afef5f0c', 'INV-088', 'Brocha de Labios', '', 9, 5, -4),
    (20, '83574ccc-dcb5-4083-8319-caa46402ff0b', 'INV-092', 'Te', '', 13, 9, -4),
    (21, '37835601-491f-4f48-81b2-dfb94882c8ac', 'INV-095', 'Disco de Algodon - Pure cotton pads', '', 1, 0, -1),
    (22, '49fba662-f3fe-406e-b48b-dddec6f2caf4', 'INV-131', 'AC Serum - Dr.esthe', '1-A-1', 0, 2, 2),
    (23, '3fa27893-7e3d-45c3-b792-bbe9078a2d18', 'ML-006', 'Cica Pepta Cream - Dr.esthe', '', 3, 0, -3),
    (24, 'cce101e9-97c4-4c43-8fbb-b63a7c95a3b1', 'ML-008', 'AC Solution Swab - Dr.esthe', '1-A-1', 200, 300, 100),
    (25, 'ea289f4b-a296-4add-a967-45d046d1701a', 'ML-013', 'Rejuvenating Toner - Dr.esthe', '1-A-1', 0, 2, 2);

  v_ajuste_id := gen_random_uuid()::text;
  v_ajuste_num := 'AJ-' || lpad((
    coalesce((
      select max(substring(numero from 4)::int)
      from public.beta_ajustes
      where numero ~ '^AJ-[0-9]+$'
    ), 0) + 1
  )::text, 3, '0');

  insert into public.beta_ajustes (
    id, numero, bodega, sububicacion, motivo, nota, origen, conteo_id, estado,
    creado_por, creado_at, aplicado_por, aplicado_at, updated_at
  ) values (
    v_ajuste_id, v_ajuste_num, 'OFICINA', null,
    'Conteo físico',
    'Conteo CF-001 (aprobado 19/11/2026 13:05 America/Guayaquil; stock aplicado por confirmación de Emilia 14:18)',
    'conteo', v_conteo_id, 'aplicado',
    v_actor, v_now, v_actor, v_now, v_now
  );

  insert into public.beta_ajuste_lineas (
    id, ajuste_id, orden, producto_id, sku, nombre, antes, despues, diferencia
  )
  select gen_random_uuid()::text, v_ajuste_id, orden, producto_id, sku, nombre, antes, despues, diferencia
  from _tk135_cf001
  order by orden;

  insert into public.beta_stock_movimientos (
    id, fecha, producto_id, sku, bodega, sububicacion, delta, tipo, doc_id, doc_numero, actor, nota, propietario
  )
  select
    gen_random_uuid()::text,
    v_now,
    producto_id,
    sku,
    'OFICINA',
    nullif(sub, ''),
    diferencia,
    'conteo',
    v_conteo_id,
    v_numero,
    v_actor,
    'Conteo físico CF-001 · ' || v_ajuste_num || case when sub <> '' then ' · ' || sub else '' end,
    'sunsu'
  from _tk135_cf001
  order by orden;

  update public.beta_conteos
     set stock_aplicado = true,
         stock_aplicado_at = v_now,
         updated_at = v_now
   where id = v_conteo_id;

  raise notice 'TK135: CF-001 aplicado (% diferencias, AJ %). INV-062 e INV-067 no se tocaron.',
    (select count(*) from _tk135_cf001), v_ajuste_num;
end $$;
