-- 🤝 Consignación dentro de Compras + actas de entrega (Emilia 17/11). Aditivo.
create table if not exists public.beta_consig_restock (
  id text primary key,
  numero text unique,
  proveedor_id uuid,
  oc_id uuid,
  familia text,
  desde date,
  hasta date,
  lineas jsonb not null default '[]'::jsonb,
  estado text not null default 'abierta' check (estado in ('abierta', 'recibida', 'anulada')),
  nota text,
  creado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.beta_consig_restock enable row level security;
comment on table public.beta_consig_restock is 'Pedido de restock de consignación (beta). La recepción a bodega de consignación está en espera.';
create table if not exists public.beta_actas (
  id text primary key,
  numero text unique,
  oc_id uuid,
  recepcion_id uuid,
  restock_id text,
  proveedor_id uuid,
  lineas jsonb not null default '[]'::jsonb,
  firma_sunsu text,
  firmado_por text,
  firmado_at timestamptz,
  firma_proveedor text,
  firma_proveedor_nombre text,
  firma_proveedor_at timestamptz,
  storage_path text,
  creado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.beta_actas enable row level security;
comment on table public.beta_actas is 'Acta de entrega-recepción (beta), generada al recibir. Firma Sunsu en la app; firma del proveedor por link público: en espera.';
