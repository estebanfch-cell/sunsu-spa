-- 0041 · Productos con paridad MineCore (beta). Solo agrega columnas a erp_productos; no toca
-- catalogo, la hoja ni datos existentes. Todo lo escribe el edge (app_write, erp_productos ya está
-- en la lista) y queda en audit_log por el trigger de siempre.
--   Archivar / eliminar (borrado suave, solo admin), descripción, mínimo y punto de reorden,
--   escalas de precio, proveedores por producto, códigos de barras y fotos/archivos (app_archivos).
alter table public.erp_productos add column if not exists beta_archivado_at timestamptz;
alter table public.erp_productos add column if not exists beta_archivado_por text;
alter table public.erp_productos add column if not exists beta_eliminado_at timestamptz;
alter table public.erp_productos add column if not exists beta_eliminado_por text;
alter table public.erp_productos add column if not exists beta_descripcion text;
alter table public.erp_productos add column if not exists beta_stock_minimo numeric;
alter table public.erp_productos add column if not exists beta_punto_reorden numeric;
alter table public.erp_productos add column if not exists beta_escalas jsonb;
alter table public.erp_productos add column if not exists beta_proveedores jsonb;
alter table public.erp_productos add column if not exists beta_codigos jsonb;
alter table public.erp_productos add column if not exists beta_archivos jsonb;
comment on column public.erp_productos.beta_archivado_at is 'Archivado en la beta (no aparece en listas ni buscadores de Productos). Null = activo.';
comment on column public.erp_productos.beta_eliminado_at is 'Borrado suave en la beta (solo admin). No se borra la fila; tickets y kardex siguen intactos.';
comment on column public.erp_productos.beta_descripcion is 'Descripción larga de la ficha (beta).';
comment on column public.erp_productos.beta_stock_minimo is 'Mínimo de stock (beta). Null = el de Cabina / inventario.';
comment on column public.erp_productos.beta_punto_reorden is 'Punto de reorden (beta): al llegar aquí se sugiere comprar.';
comment on column public.erp_productos.beta_escalas is 'Escalas de precio [{nombre, desde, precio, markup}] (beta).';
comment on column public.erp_productos.beta_proveedores is 'Proveedores del producto [{proveedor_id, proveedor, codigo, precio, predeterminado}] (beta).';
comment on column public.erp_productos.beta_codigos is 'Códigos de barras [{codigo, tipo: ean13|interno|otro, principal}] (beta).';
comment on column public.erp_productos.beta_archivos is 'Fotos y archivos [{id (app_archivos), nombre, mime, tipo: foto|archivo, at, por}] (beta).';
