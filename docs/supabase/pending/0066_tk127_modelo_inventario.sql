-- TK127: modelo de inventario. Un producto, código según la bodega,
-- stock por dueño. Aditivo: backups primero. No se borran productos,
-- no se reescriben tickets, no se toca CF-001 ni sus líneas.
--
-- Código visible:
--   Cabina / Oficina → código interno (INV-110)
--   Venta / consignación → SKU del proveedor (ML-008)
-- Una transferencia no cambia el producto ni el dueño; solo el código que aplica.
-- La liquidación paga solo lo vendido desde stock de consignación del proveedor.
-- INV-123 en Productos es la caja de gift card: el crema JN-009 recibe INV-132
-- (el código INV-123 de la hoja de cabina choca; queda para decisión).

create table if not exists public._bak_20261119_tk127_erp_productos as table public.erp_productos;
create table if not exists public._bak_20261119_tk127_erp_stock as table public.erp_stock;
create table if not exists public._bak_20261119_tk127_erp_movimientos as table public.erp_movimientos;
create table if not exists public._bak_20261119_tk127_beta_sku_alias as table public.beta_sku_alias;
create table if not exists public._bak_20261119_tk127_beta_stock_movimientos as table public.beta_stock_movimientos;

alter table public._bak_20261119_tk127_erp_productos enable row level security;
alter table public._bak_20261119_tk127_erp_stock enable row level security;
alter table public._bak_20261119_tk127_erp_movimientos enable row level security;
alter table public._bak_20261119_tk127_beta_sku_alias enable row level security;
alter table public._bak_20261119_tk127_beta_stock_movimientos enable row level security;

alter table public.erp_productos add column if not exists codigo_interno text;
alter table public.erp_productos add column if not exists beta_pendiente_conteo boolean not null default false;
alter table public.erp_productos add column if not exists beta_canonico_id text;
alter table public.erp_stock add column if not exists propietario text;
alter table public.erp_stock add column if not exists revision_lote boolean not null default false;
alter table public.erp_movimientos add column if not exists propietario text;
alter table public.beta_stock_movimientos add column if not exists propietario text;

create unique index if not exists erp_productos_codigo_interno_uidx
  on public.erp_productos (codigo_interno)
  where codigo_interno is not null and codigo_interno <> ''
    and coalesce(beta_canonico_id, '') = '';

-- Dueño por defecto del stock actual (sin cambiar cantidades ni lotes).
-- Cabina / Oficina / Casa → sunsu.
-- Bodega CONSIGNACION → consignacion.
-- Venta de familia de consignación (ML/VK/HT/AS/PH/JN) → consignacion (legado).
-- Resto de Venta → sunsu.
update public.erp_stock s
set propietario = case
  when b.codigo in ('CABINA','CAB2','CAB3','CASA') or b.tipo in ('cabina','casa','bodega') then 'sunsu'
  when b.codigo = 'CONSIGNACION' or b.tipo = 'consignacion' then 'consignacion'
  when (b.codigo = 'VENTA' or b.tipo = 'venta')
       and (
         p.sku ~ '^(ML|VK|HT|AS|PH|JN)-'
         or coalesce(p.sku_proveedor, '') ~ '^(ML|VK|HT|AS|PH|JN)-'
       ) then 'consignacion'
  else 'sunsu'
end
from public.erp_bodegas b, public.erp_productos p
where s.bodega_id = b.id and s.producto_id = p.id
  and coalesce(s.propietario, '') = '';

-- Movimientos viejos: misma regla, para no reescribir tickets.
update public.erp_movimientos m
set propietario = case
  when b.codigo in ('CABINA','CAB2','CAB3','CASA') or b.tipo in ('cabina','casa','bodega') then 'sunsu'
  when b.codigo = 'CONSIGNACION' or b.tipo = 'consignacion' then 'consignacion'
  when (b.codigo = 'VENTA' or b.tipo = 'venta')
       and (
         p.sku ~ '^(ML|VK|HT|AS|PH|JN)-'
         or coalesce(p.sku_proveedor, '') ~ '^(ML|VK|HT|AS|PH|JN)-'
       ) then 'consignacion'
  else 'sunsu'
end
from public.erp_bodegas b, public.erp_productos p
where m.bodega_id = b.id and m.producto_id = p.id
  and coalesce(m.propietario, '') = '';

-- Códigos internos y SKU proveedor (15 ya ligados + ML sin ficha de cabina + uniones).
-- No se asigna INV-123 al crema JN-009: INV-123 es la caja de gift card.
update public.erp_productos set codigo_interno = 'INV-110', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'ML-008') where id = 'cce101e9-97c4-4c43-8fbb-b63a7c95a3b1' and sku = 'ML-008';
update public.erp_productos set codigo_interno = 'INV-066', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'ML-006') where id = '3fa27893-7e3d-45c3-b792-bbe9078a2d18' and sku = 'ML-006';
update public.erp_productos set codigo_interno = 'INV-107', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'ML-009') where id = '2935e65c-c341-47ba-95d4-b98a53e79a9c' and sku = 'ML-009';
update public.erp_productos set codigo_interno = 'INV-125', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'ML-010') where id = 'fe3000f8-1438-40eb-bd32-93a6c1dbb0bf' and sku = 'ML-010';
update public.erp_productos set codigo_interno = 'INV-121', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'ML-011') where id = '752578da-9438-4e8a-80a0-29c869e275e5' and sku = 'ML-011';
update public.erp_productos set codigo_interno = 'INV-126', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'ML-012') where id = 'ada26d63-caaf-4b36-bd00-e9b8578a538f' and sku = 'ML-012';
update public.erp_productos set codigo_interno = 'INV-068', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'ML-013') where id = 'ea289f4b-a296-4add-a967-45d046d1701a' and sku = 'ML-013';
update public.erp_productos set codigo_interno = 'INV-124', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'ML-014') where id = 'abe735d3-94bf-4766-83c5-7bd3ba882857' and sku = 'ML-014';
update public.erp_productos set codigo_interno = 'INV-036', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'HT-003'), beta_pendiente_conteo = true where id = '377b5fa6-ed50-4e03-bc86-9505f9872c45' and sku = 'HT-003';
update public.erp_productos set codigo_interno = 'INV-037', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'HT-004') where id = '3087e974-9563-4ab1-9cd2-4ada867512ba' and sku = 'HT-004';
update public.erp_productos set codigo_interno = 'INV-132', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'JN-009') where id = '3bd4c865-74f0-46c2-a1bd-fb0e867aa0c2' and sku = 'JN-009';
update public.erp_productos set codigo_interno = 'INV-127', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'VK-001') where id = 'abd9ec87-ee9e-4c3e-bfdb-832d33af341d' and sku = 'VK-001';
update public.erp_productos set codigo_interno = 'INV-128', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'VK-002') where id = '7e7c3175-b175-4819-8fd0-bef30c5a94f1' and sku = 'VK-002';
update public.erp_productos set codigo_interno = 'INV-129', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'VK-003') where id = 'ce0327c5-5342-44a3-af1b-51fcb43cdaa0' and sku = 'VK-003';
update public.erp_productos set codigo_interno = 'INV-130', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'VK-004') where id = '8f0048b6-8d6c-42b8-bd99-83fae1ac0601' and sku = 'VK-004';

-- ML sin ficha de cabina: siguiente INV- libre (135–141).
update public.erp_productos set codigo_interno = 'INV-135', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'ML-001') where id = '7e1efed0-d107-4127-ad5f-1f8d68899bbc' and sku = 'ML-001';
update public.erp_productos set codigo_interno = 'INV-136', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'ML-002') where id = '31426a65-2e67-42dd-9d7b-6aaa2644bd7a' and sku = 'ML-002';
update public.erp_productos set codigo_interno = 'INV-137', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'ML-003') where id = '15c0c701-f587-4ed5-8304-48e714ef3b31' and sku = 'ML-003';
update public.erp_productos set codigo_interno = 'INV-138', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'ML-004') where id = '4dbf3984-9641-40ee-8fee-2e49c269ca64' and sku = 'ML-004';
update public.erp_productos set codigo_interno = 'INV-139', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'ML-005') where id = 'af2466e2-dafa-46fd-a7d4-6c64ce03865c' and sku = 'ML-005';
update public.erp_productos set codigo_interno = 'INV-140', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'ML-007') where id = '80c5622b-b7bd-4ceb-a7a7-5abba27ea096' and sku = 'ML-007';
update public.erp_productos set codigo_interno = 'INV-141', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'ML-015') where id = '3c84e2f9-6bb2-43fc-9474-f58da94e21ea' and sku = 'ML-015';

-- Uniones: un producto, lotes separados, pendiente de conteo. No se suman.
-- HT-002 + VK-009 → canónico VK-009, interno INV-133.
-- HT-014 + VK-010 → canónico VK-010, interno INV-134.
-- HT-003 + (fila VK-007) → canónico HT-003, interno INV-036 (ya arriba).
update public.erp_productos
set codigo_interno = 'INV-133', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'VK-009'), beta_pendiente_conteo = true
where id = 'f88b69e9-c317-47f3-818c-d3e949605615' and sku = 'VK-009';
update public.erp_productos
set beta_canonico_id = 'f88b69e9-c317-47f3-818c-d3e949605615', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'HT-002')
where id = '03cd6d25-738a-430c-b050-b011a8c2ea69' and sku = 'HT-002';

update public.erp_productos
set codigo_interno = 'INV-134', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'VK-010'), beta_pendiente_conteo = true
where id = '7a9a9d46-24cf-44da-a3d2-c9eb110fa68d' and sku = 'VK-010';
update public.erp_productos
set beta_canonico_id = '7a9a9d46-24cf-44da-a3d2-c9eb110fa68d', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'HT-014')
where id = '04d4aef9-9b9f-499f-bc7b-44d632fca8e9' and sku = 'HT-014';

update public.erp_productos
set beta_canonico_id = '377b5fa6-ed50-4e03-bc86-9505f9872c45', sku_proveedor = coalesce(nullif(sku_proveedor,''), 'VK-007')
where id = '0be9c570-a36f-43c5-bea3-49c89325e9e5' and sku = 'VK-007';

-- Mueve el stock de la fila fusionada al canónico, como lote de revisión (cantidades iguales, no sumadas en un solo lote).
update public.erp_stock s
set producto_id = '377b5fa6-ed50-4e03-bc86-9505f9872c45',
    lote = case when coalesce(s.lote, '') = '' then 'REV:VK-007' else 'REV:VK-007/' || s.lote end,
    revision_lote = true,
    propietario = coalesce(nullif(s.propietario, ''), 'consignacion')
where s.producto_id = '0be9c570-a36f-43c5-bea3-49c89325e9e5'
  and s.cantidad <> 0
  and not exists (
    select 1 from public.erp_stock x
    where x.producto_id = '377b5fa6-ed50-4e03-bc86-9505f9872c45'
      and x.bodega_id = s.bodega_id
      and x.sububicacion is not distinct from s.sububicacion
      and x.lote = case when coalesce(s.lote, '') = '' then 'REV:VK-007' else 'REV:VK-007/' || s.lote end
  );

update public.erp_stock s
set producto_id = 'f88b69e9-c317-47f3-818c-d3e949605615',
    lote = case when coalesce(s.lote, '') = '' then 'REV:HT-002' else 'REV:HT-002/' || s.lote end,
    revision_lote = true,
    propietario = coalesce(nullif(s.propietario, ''), 'consignacion')
where s.producto_id = '03cd6d25-738a-430c-b050-b011a8c2ea69'
  and s.cantidad <> 0
  and not exists (
    select 1 from public.erp_stock x
    where x.producto_id = 'f88b69e9-c317-47f3-818c-d3e949605615'
      and x.bodega_id = s.bodega_id
      and x.sububicacion is not distinct from s.sububicacion
      and x.lote = case when coalesce(s.lote, '') = '' then 'REV:HT-002' else 'REV:HT-002/' || s.lote end
  );

update public.erp_stock s
set producto_id = '7a9a9d46-24cf-44da-a3d2-c9eb110fa68d',
    lote = case when coalesce(s.lote, '') = '' then 'REV:HT-014' else 'REV:HT-014/' || s.lote end,
    revision_lote = true,
    propietario = coalesce(nullif(s.propietario, ''), 'consignacion')
where s.producto_id = '04d4aef9-9b9f-499f-bc7b-44d632fca8e9'
  and s.cantidad <> 0
  and not exists (
    select 1 from public.erp_stock x
    where x.producto_id = '7a9a9d46-24cf-44da-a3d2-c9eb110fa68d'
      and x.bodega_id = s.bodega_id
      and x.sububicacion is not distinct from s.sububicacion
      and x.lote = case when coalesce(s.lote, '') = '' then 'REV:HT-014' else 'REV:HT-014/' || s.lote end
  );

-- Presentaciones (no se borra nada): la talla menor apunta a la base.
update public.erp_productos set producto_base = 'INV-074' where id = '35ac81eb-db3e-4063-9e12-0aa8350c3f4f' and sku = 'INV-075' and coalesce(producto_base, '') = '';
update public.erp_productos set producto_base = 'INV-076' where id = '99d7d189-0606-4dc6-80fa-10b0e9eb26b4' and sku = 'INV-077' and coalesce(producto_base, '') = '';
update public.erp_productos set producto_base = 'INV-028' where id = 'da5645d0-24a6-4ce0-8a8f-a964a044388d' and sku = 'INV-100' and coalesce(producto_base, '') = '';

-- Alias: códigos viejos siguen sirviendo en búsqueda, tickets y Migo/CUADRE.
-- No se usa INV-123 como alias del crema (choca con la caja de gift card).
insert into public.beta_sku_alias (alias, sku, origen, nota)
select v.alias, v.sku, 'tk127', v.nota
from (values
  ('INV-110','ML-008','código interno'),
  ('SUNSU-ML-008','ML-008','alias de catálogo'),
  ('INV-066','ML-006','código interno'),
  ('SUNSU-ML-006','ML-006','alias de catálogo'),
  ('INV-107','ML-009','código interno'),
  ('SUNSU-ML-009','ML-009','alias de catálogo'),
  ('INV-125','ML-010','código interno'),
  ('SUNSU-ML-010','ML-010','alias de catálogo'),
  ('INV-121','ML-011','código interno'),
  ('SUNSU-ML-011','ML-011','alias de catálogo'),
  ('INV-126','ML-012','código interno'),
  ('SUNSU-ML-012','ML-012','alias de catálogo'),
  ('INV-068','ML-013','código interno'),
  ('SUNSU-ML-013','ML-013','alias de catálogo'),
  ('INV-124','ML-014','código interno'),
  ('SUNSU-ML-014','ML-014','alias de catálogo'),
  ('INV-036','HT-003','código interno'),
  ('SUNSU-HT-003','HT-003','alias de catálogo'),
  ('VK-007','HT-003','código ligando, pendiente de conteo'),
  ('SUNSU-VK-007','HT-003','alias de catálogo'),
  ('INV-037','HT-004','código interno'),
  ('SUNSU-HT-004','HT-004','alias de catálogo'),
  ('INV-132','JN-009','código interno (INV-123 es la caja de gift card)'),
  ('SUNSU-JN-009','JN-009','alias de catálogo'),
  ('INV-127','VK-001','código interno'),
  ('SUNSU-VK-001','VK-001','alias de catálogo'),
  ('INV-128','VK-002','código interno'),
  ('SUNSU-VK-002','VK-002','alias de catálogo'),
  ('INV-129','VK-003','código interno'),
  ('SUNSU-VK-003','VK-003','alias de catálogo'),
  ('INV-130','VK-004','código interno'),
  ('SUNSU-VK-004','VK-004','alias de catálogo'),
  ('INV-133','VK-009','código interno'),
  ('HT-002','VK-009','código ligando, pendiente de conteo'),
  ('SUNSU-HT-002','VK-009','alias de catálogo'),
  ('SUNSU-VK-009','VK-009','alias de catálogo'),
  ('INV-134','VK-010','código interno'),
  ('HT-014','VK-010','código ligando, pendiente de conteo'),
  ('SUNSU-HT-014','VK-010','alias de catálogo'),
  ('SUNSU-VK-010','VK-010','alias de catálogo'),
  ('INV-135','ML-001','código interno'),
  ('SUNSU-ML-001','ML-001','alias de catálogo'),
  ('INV-136','ML-002','código interno'),
  ('SUNSU-ML-002','ML-002','alias de catálogo'),
  ('INV-137','ML-003','código interno'),
  ('SUNSU-ML-003','ML-003','alias de catálogo'),
  ('INV-138','ML-004','código interno'),
  ('SUNSU-ML-004','ML-004','alias de catálogo'),
  ('INV-139','ML-005','código interno'),
  ('SUNSU-ML-005','ML-005','alias de catálogo'),
  ('INV-140','ML-007','código interno'),
  ('SUNSU-ML-007','ML-007','alias de catálogo'),
  ('INV-141','ML-015','código interno'),
  ('SUNSU-ML-015','ML-015','alias de catálogo'),
  ('SU-004','INV-097','SKU inactivo, mismo producto'),
  ('AS-008','AS-010','SKU inactivo, mismo producto'),
  ('34','35','gift card inactiva, mismo producto (confirmar)')
) as v(alias, sku, nota)
where not exists (select 1 from public.beta_sku_alias a where a.alias = v.alias);

-- Alias de filas fusionadas hacia el canónico, para que la ficha inactiva no quede huérfana.
update public.erp_productos p
set beta_pendiente_conteo = true
where p.beta_canonico_id is not null
  and p.sku in ('VK-007','HT-002','HT-014');

comment on column public.erp_productos.codigo_interno is 'TK127: código interno Sunsu (INV-). Se muestra en Cabina y Oficina.';
comment on column public.erp_productos.beta_pendiente_conteo is 'TK127: Pendiente de conteo: stock en 2 lotes. No se suman las cantidades.';
comment on column public.erp_stock.propietario is 'TK127: sunsu | consignacion. Una transferencia conserva el dueño.';
comment on column public.erp_movimientos.propietario is 'TK127: dueño del lote del que salió o al que entró el movimiento.';
