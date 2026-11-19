-- TK115: costos, utilidad, margen y precios de compra solo para Super Admin.
-- Aditivo: no se borran columnas ni tablas, no se recorta app_beta_write.
-- Backup de grants y de la vista v_ticket_productos antes de revocar privilegios.
-- La API (service_role) sigue leyendo todo; el candado de PostgREST es para
-- anon / authenticated / sunsu_rls. sunsu_admin conserva acceso completo.

create table if not exists public.tk115_grants_bak_20261119 as
select table_schema, table_name, grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'catalogo', 'erp_productos', 'inventario_base', 'erp_oc', 'erp_oc_lineas',
    'ordenes_compra', 'beta_ticket_lineas', 'beta_ticket_snaps', 'beta_tickets',
    'v_ticket_productos'
  );

create table if not exists public.tk115_col_grants_bak_20261119 as
select table_schema, table_name, column_name, grantee, privilege_type, is_grantable
from information_schema.column_privileges
where table_schema = 'public'
  and table_name in (
    'catalogo', 'erp_productos', 'inventario_base', 'erp_oc', 'erp_oc_lineas',
    'ordenes_compra', 'beta_ticket_lineas', 'beta_ticket_snaps', 'v_ticket_productos'
  );

create table if not exists public.tk115_viewdef_bak_20261119 (
  nombre text primary key,
  def text,
  saved_at timestamptz default now()
);

insert into public.tk115_viewdef_bak_20261119 (nombre, def)
values ('v_ticket_productos', pg_get_viewdef('public.v_ticket_productos'::regclass, true))
on conflict (nombre) do nothing;

-- Vista pública sin precio de compra. CREATE OR REPLACE no puede quitar columnas:
-- se reemplaza con DROP + CREATE. La versión con costo queda solo para sunsu_admin.
drop view if exists public.v_ticket_productos;
create view public.v_ticket_productos as
  select
    v.id as ticket_id,
    v.ciclo,
    v.cosm,
    v.excl_producto,
    k.key as codigo,
    (k.value #>> '{}'::text[])::numeric as qty,
    c.subtotal as venta
  from v_tickets v
  join tickets t on t.id = v.id
  cross join lateral jsonb_each(t.orig) k(key, value)
  left join catalogo c
    on upper(regexp_replace(c.sku, '^SUNSU-'::text, ''::text, 'g'))
     = upper(regexp_replace(k.key, '^SUNSU-'::text, ''::text, 'g'))
  where k.key ~ '^(SUNSU-)?[A-Z]{2,3}-[0-9]{3}$'::text
    and jsonb_typeof(k.value) = 'number'
    and ((k.value #>> '{}'::text[])::numeric) > 0::numeric;

create or replace view public.v_ticket_productos_costos as
  select
    v.id as ticket_id,
    v.ciclo,
    v.cosm,
    v.excl_producto,
    k.key as codigo,
    (k.value #>> '{}'::text[])::numeric as qty,
    c.subtotal as venta,
    nullif(regexp_replace(c.precio_compra, '[^0-9.]'::text, ''::text, 'g'), ''::text)::numeric as compra
  from v_tickets v
  join tickets t on t.id = v.id
  cross join lateral jsonb_each(t.orig) k(key, value)
  left join catalogo c
    on upper(regexp_replace(c.sku, '^SUNSU-'::text, ''::text, 'g'))
     = upper(regexp_replace(k.key, '^SUNSU-'::text, ''::text, 'g'))
  where k.key ~ '^(SUNSU-)?[A-Z]{2,3}-[0-9]{3}$'::text
    and jsonb_typeof(k.value) = 'number'
    and ((k.value #>> '{}'::text[])::numeric) > 0::numeric;

revoke all on table public.v_ticket_productos from anon, authenticated, public;
grant select on public.v_ticket_productos to sunsu_rls, sunsu_admin;

revoke all on table public.v_ticket_productos_costos from anon, authenticated, public, sunsu_rls;
grant select on public.v_ticket_productos_costos to sunsu_admin;

-- Quitar DML amplio de anon/authenticated sobre tablas con costos.
revoke all on table
  public.catalogo,
  public.erp_productos,
  public.inventario_base,
  public.erp_oc,
  public.erp_oc_lineas,
  public.ordenes_compra,
  public.beta_ticket_lineas,
  public.beta_ticket_snaps
from anon, authenticated, public;

-- sunsu_rls: solo columnas que no son costo / utilidad / margen / precio de compra.
revoke all on table
  public.catalogo,
  public.erp_productos,
  public.inventario_base,
  public.erp_oc,
  public.erp_oc_lineas,
  public.ordenes_compra,
  public.beta_ticket_lineas,
  public.beta_ticket_snaps
from sunsu_rls;

grant select (
  id, sheet_row, sku, producto_servicio, tipo, subtotal, iva, total_con_iva,
  activo, col_17, orig, created_at, updated_at, origin
) on public.catalogo to sunsu_rls;

grant select (
  id, sku, nombre, marca, categoria, clase, unidad, unidad_consumo, factor_consumo,
  uso, precio_venta, iva, lote_obligatorio, caduca, foto_url, activo, legacy_tabla,
  origin, sku_proveedor, linea, observaciones, bodega_origen_venta, codigo_barras,
  producto_base, bodega_def, sububicacion_def, foto_thumb, beta_pvp, beta_editado_por,
  beta_editado_at, beta_precio_motivo, beta_archivado_at, beta_archivado_por,
  beta_eliminado_at, beta_eliminado_por, beta_descripcion, beta_stock_minimo,
  beta_punto_reorden, beta_escalas, beta_proveedores, beta_codigos, beta_archivos,
  beta_contenido, beta_contenido_unidad, beta_envase, beta_unidades_empaque,
  beta_presentaciones, beta_activo, beta_activo_por, beta_activo_at, beta_activo_motivo,
  beta_aplica_faciales, beta_origen
) on public.erp_productos to sunsu_rls;
-- No se otorgan: costo_promedio, beta_compra_real, beta_compra_comision.

grant select (sku, stock_inicial, minimo, updated_at)
  on public.inventario_base to sunsu_rls;
-- No se otorga: compra.

grant select (
  id, numero, proveedor_id, rfq_id, fecha, fecha_esperada, bodega_destino_id,
  estado, estado_pago, nota, creado_por, legacy_sheet_row, tipo, q_label, origin, flujo
) on public.erp_oc to sunsu_rls;
-- No se otorgan: subtotal, iva, flete, total, pagado, saldo, snap.

grant select (
  id, oc_id, producto_id, cantidad, bodega_id, recibido, plazo, orden, origin,
  no_recibido, beta_no_recibido_at, beta_no_recibido_por, beta_no_recibido_qty
) on public.erp_oc_lineas to sunsu_rls;
-- No se otorgan: precio, descuento_pct, subtotal.

-- ordenes_compra.json trae fact/items/directa con costos: sin SELECT para sunsu_rls.
-- beta_ticket_lineas / beta_ticket_snaps: sin SELECT para sunsu_rls (ahí están
-- costo_real, compra_comision, utilidad, falta_costo).

-- sunsu_admin (rol de base, no el rol de app "admin") conserva privilegios completos.
grant select, insert, update, delete on table
  public.catalogo,
  public.erp_productos,
  public.inventario_base,
  public.erp_oc,
  public.erp_oc_lineas,
  public.ordenes_compra,
  public.beta_ticket_lineas,
  public.beta_ticket_snaps
to sunsu_admin;
