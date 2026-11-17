-- 📦 Abrir producto (Emilia 17/11): cada envase que se abre en una cabina o en el local.
-- Abrir el siguiente del mismo producto en el mismo destino cierra el anterior; con eso se sabe
-- cuántos faciales rindió cada envase → uso y costo por facial («protocolo automático»). Aditivo.
create table if not exists public.beta_aperturas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null,
  sku text,
  nombre text,
  presentacion text,
  contenido numeric,
  contenido_unidad text,
  costo numeric,
  destino text not null,
  bodega_id uuid,
  abierto_at timestamptz not null default now(),
  usuario text,
  firma_url text,
  cerrado_at timestamptz,
  cerrado_por_apertura_id uuid,
  mov_ref text,
  anulada boolean not null default false,
  anulada_motivo text,
  anulada_por text,
  nota text,
  created_at timestamptz not null default now()
);
create index if not exists beta_aperturas_prod_dest_idx on public.beta_aperturas (producto_id, destino, abierto_at desc);
alter table public.beta_aperturas enable row level security;
-- Ficha de producto: a qué faciales aplica (códigos SUNSU-xx del catálogo).
alter table public.erp_productos add column if not exists beta_aplica_faciales jsonb;
