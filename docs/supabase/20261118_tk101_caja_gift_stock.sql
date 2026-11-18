-- TK101 (Emilia 18/11 17:23, America/Guayaquil): caja de gift card INV-123 como producto
-- inventariado. El producto ya existe en erp_productos (TK98). Se agrega stock 0 en Venta
-- (conteo físico pendiente) y la ficha en catálogo / inventario_base. Solo INSERTs aditivos
-- y backups. No reescribe filas existentes.

create table if not exists public.erp_stock_bk_20261118_tk101 as table public.erp_stock;
create table if not exists public.inventario_base_bk_20261118_tk101 as table public.inventario_base;
create table if not exists public.catalogo_bk_20261118_tk101 as table public.catalogo;
create table if not exists public.beta_ticket_flags_bk_20261118_tk101 as table public.beta_ticket_flags;
create table if not exists public.beta_cuadre_link_bk_20261118_tk101 as table public.beta_cuadre_link;

-- Stock 0 en bodega Venta. uso del producto = venta: al vender se descuenta de aquí
-- (regla normal de productos). Cabina no aplica hasta que un conteo lo justifique.
insert into public.erp_stock (producto_id, bodega_id, cantidad, sububicacion, lote, origin)
select '431cfb2f-9c64-4ccf-84b3-7c5c2e8911c8'::uuid,
       '11111111-1111-4111-8111-111111111111'::uuid,
       0, '', '', 'tk101-conteo-pendiente'
where not exists (
  select 1 from public.erp_stock s
  where s.producto_id = '431cfb2f-9c64-4ccf-84b3-7c5c2e8911c8'::uuid
    and s.bodega_id = '11111111-1111-4111-8111-111111111111'::uuid
);

insert into public.inventario_base (sku, stock_inicial, minimo, compra)
select 'SUNSU-INV-123', 0, 0, 0
where not exists (
  select 1 from public.inventario_base b
  where b.sku in ('SUNSU-INV-123', 'INV-123', 'SUNSU-INV-000123')
);

insert into public.catalogo (
  sheet_row, sku, producto_servicio, tipo, subtotal, iva, total_con_iva, activo, orig, origin
)
select (select coalesce(max(sheet_row),0)+1 from public.catalogo), 'SUNSU-INV-123', 'Caja de gift card', 'PRODUCTO', 2.61, 0.39, 3.00, true, '{}'::jsonb, 'tk100'
where not exists (
  select 1 from public.catalogo c
  where c.sku in ('SUNSU-INV-123', 'INV-123', 'SUNSU-INV-000123')
);

-- Nota en el producto: stock 0 pendiente de conteo físico (no pisa observaciones TK98, las complementa).
update public.erp_productos
set observaciones = trim(both from coalesce(observaciones, '') ||
  case when coalesce(observaciones, '') not like '%TK101%'
       then E'\nTK101 (18/11 17:23): stock inicial 0 en Venta, pendiente de conteo físico de cajas.'
       else '' end),
    beta_editado_at = now(),
    beta_editado_por = 'Grok Bot (por Emilia)'
where sku = 'INV-123'
  and coalesce(observaciones, '') not like '%TK101%';
