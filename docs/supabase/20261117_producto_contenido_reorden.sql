
-- 20261117_producto_contenido_reorden.sql
-- Presentación (contenido, unidad, envase, unidades por empaque) y reorden
-- en columnas beta_* de erp_productos. Tabla/vista de revisión para la marca roja.
-- Aditivo. No toca hojas, Apps Script, Migo ni el frontend.
--
-- Fórmula de reorden (ciclo de reposición 15 días), con meses recientes con más peso:
--   peso = 4 en los últimos 3 meses (sep–nov 2026), 2 en los 3 anteriores (jun–ago),
--          1 en meses más viejos (desde mar 2025).
--   demanda diaria = suma(uds_mes × peso) / suma(días_mes × peso)
--     (desde el primer mes con venta del SKU hasta hoy, noviembre cuenta 17 días).
--   stock_mínimo = max(1, techo(7 × demanda diaria))     -- seguridad ≈ 1 semana
--   punto_reorden = techo(15 × demanda diaria + stock_mínimo)
--   Sin ventas: se dejan vacíos y se marca sin_reorden / sin_ventas.
-- Fuentes de venta: beta_migo_lineas (tipo=producto, hasta 2026-04-30)
--   + tickets (columnas de SKU, desde 2026-05-01) + historial_ventas (may 2026 en adelante,
--   solo SKUs que no tienen columna en el ticket, p.ej. INV).

create table if not exists public.beta_producto_revision (
  producto uuid primary key references public.erp_productos(id) on delete cascade,
  sku text not null,
  faltantes text[] not null default '{}'::text[],
  sin_ventas boolean not null default false,
  updated_at timestamptz not null default now()
);

create unique index if not exists beta_producto_revision_sku_idx
  on public.beta_producto_revision (sku);

comment on table public.beta_producto_revision is
  'Marca roja de ficha incompleta en la beta. Preferible leer la vista beta_v_producto_revision (se actualiza sola). faltantes: sin_precio, sin_costo, sin_contenido, sin_envase, sin_reorden, sin_foto.';
comment on column public.beta_producto_revision.faltantes is
  'Códigos de campos faltantes: sin_precio, sin_costo, sin_contenido, sin_envase, sin_reorden, sin_foto.';
comment on column public.beta_producto_revision.sin_ventas is
  'Inventariable sin ventas en Migo (mar 2025–abr 2026) ni en el sistema desde may 2026; stock mínimo y reorden quedan vacíos.';

alter table public.beta_producto_revision enable row level security;

grant select, insert, update, delete, references, trigger, truncate
  on public.beta_producto_revision to anon, authenticated, service_role;

drop policy if exists beta_producto_revision_select on public.beta_producto_revision;
create policy beta_producto_revision_select on public.beta_producto_revision
  for select to anon, authenticated, service_role using (true);

-- Vista en vivo: la UI puede usarla para no quedar desfasada cuando alguien complete la ficha.
create or replace view public.beta_v_producto_revision as
select
  p.id as producto,
  p.sku,
  p.clase,
  array_remove(array[
    case
      when coalesce(p.beta_pvp, p.precio_venta, 0) <= 0
      then 'sin_precio' end,
    case
      when p.clase = 'producto'
       and coalesce(p.beta_compra_real, p.costo_promedio, 0) <= 0
      then 'sin_costo' end,
    case
      when p.clase = 'producto'
       and (p.beta_contenido is null or p.beta_contenido_unidad is null)
      then 'sin_contenido' end,
    case
      when p.clase = 'producto' and p.beta_envase is null
      then 'sin_envase' end,
    case
      when p.clase = 'producto' and p.beta_punto_reorden is null
      then 'sin_reorden' end,
    case
      when p.clase = 'producto'
       and coalesce(nullif(btrim(p.foto_url), ''), nullif(btrim(p.foto_thumb), '')) is null
       and not exists (
         select 1 from jsonb_array_elements(coalesce(p.beta_archivos, '[]'::jsonb)) a
         where coalesce(a->>'borrado', 'false') not in ('true', 't')
           and coalesce(a->>'tipo', '') = 'foto'
       )
      then 'sin_foto' end
  ], null) as faltantes,
  (p.clase = 'producto' and p.beta_punto_reorden is null) as sin_ventas
from public.erp_productos p
where p.beta_eliminado_at is null;

comment on view public.beta_v_producto_revision is
  'Revisión en vivo de fichas beta. Faltantes según precio efectivo (beta_pvp o precio_venta o catálogo), costo (beta_compra_real o costo_promedio), contenido/envase/reorden (solo inventariables) y foto.';

grant select on public.beta_v_producto_revision to anon, authenticated, service_role;

notify pgrst, 'reload schema';
