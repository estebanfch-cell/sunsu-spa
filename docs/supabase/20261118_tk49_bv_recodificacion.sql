-- TK49 (Emilia t495u, 18/11): productos Bruno Vassari con código INV pasan a la familia BV, en MAYÚSCULAS y
-- siguiendo la serie del que ya la tenía (BV-001 Lab Tech Cryo SOS Cream):
--   INV-098 Concentrado Calmante → BV-002 · INV-106 Instant Cooling Mask → BV-003
-- Solo beta: erp_productos (no lo sincroniza la hoja). La hoja (cabina_inventario, historial) NO se toca:
-- el código viejo queda como alias en beta_sku_alias, así el historial y la fila de cabina siguen resolviendo.
-- Stock, kardex, aperturas, OC, etc. van por producto_id: no cambian.
-- Respaldo antes de cambiar. Reversible: update erp_productos set sku = b.sku from beta_productos_backup_20261118_bv b where b.id = erp_productos.id;
create table if not exists public.beta_productos_backup_20261118_bv as
  select * from public.erp_productos where sku in ('INV-098', 'INV-106', 'BV-001');
alter table public.beta_productos_backup_20261118_bv enable row level security;

insert into public.beta_sku_alias (alias, sku, origen, nota)
select v.alias, v.sku, 'recodificacion_bv', 'TK49 18/11: código INV anterior (Bruno Vassari)'
from (values ('INV-098', 'BV-002'), ('SUNSU-INV-000098', 'BV-002'), ('INV-106', 'BV-003'), ('SUNSU-INV-000106', 'BV-003')) as v(alias, sku)
where not exists (select 1 from public.beta_sku_alias a where upper(a.alias) = v.alias);

update public.erp_productos set sku = 'BV-002' where sku = 'INV-098' and not exists (select 1 from public.erp_productos where sku = 'BV-002');
update public.erp_productos set sku = 'BV-003' where sku = 'INV-106' and not exists (select 1 from public.erp_productos where sku = 'BV-003');
