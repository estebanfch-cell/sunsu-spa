-- 0044: Presentación / envase por producto (Emilia 17/11). Solo agrega columnas beta_* en
-- erp_productos (la hoja no las sincroniza, así que nada las pisa). Para costo por g/ml.
alter table public.erp_productos add column if not exists beta_contenido numeric;
alter table public.erp_productos add column if not exists beta_contenido_unidad text;
alter table public.erp_productos add column if not exists beta_envase text;
alter table public.erp_productos add column if not exists beta_unidades_empaque numeric;
alter table public.erp_productos add column if not exists beta_presentaciones jsonb not null default '[]'::jsonb;
comment on column public.erp_productos.beta_contenido is 'Contenido del envase (número), en beta_contenido_unidad (g, ml, unidades).';
comment on column public.erp_productos.beta_envase is 'Tipo de envase: frasco, tubo, ampolla, sachet, caja…';
comment on column public.erp_productos.beta_unidades_empaque is 'Unidades por empaque (cuántos envases trae la caja del proveedor).';
comment on column public.erp_productos.beta_presentaciones is 'Ids de erp_productos que son el mismo producto base en otro tamaño.';

-- Activo/Inactivo de la beta (17/11): lo fija un admin en la ficha; manda sobre el estado del
-- sistema viejo (catalogo/cabina_inventario/erp_productos.activo) y la sync horaria no lo toca.
-- NULL = seguir al sistema viejo. Cada cambio queda en audit_log (trg_audit).
alter table public.erp_productos add column if not exists beta_activo boolean;
alter table public.erp_productos add column if not exists beta_activo_por text;
alter table public.erp_productos add column if not exists beta_activo_at timestamptz;
alter table public.erp_productos add column if not exists beta_activo_motivo text;
comment on column public.erp_productos.beta_activo is 'Beta: estado Activo/Inactivo fijado por admin (NULL = el del sistema viejo).';
