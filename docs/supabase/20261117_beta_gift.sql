-- TK20 Gift cards estilo MineCore: datos extra (para/de/servicio/validez/tickets/historial) y PDFs guardados.
-- Aditivo: tablas nuevas beta_*; gift_cards (la hoja) no cambia de estructura.
create table if not exists public.beta_gift_ajustes (
  gift_id bigint primary key,
  codigo text not null,
  para text, de text, servicio text, mensaje text,
  valido_hasta date,
  ticket_venta text, ticket_uso text,
  historial jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists beta_gift_ajustes_codigo on public.beta_gift_ajustes (codigo);
alter table public.beta_gift_ajustes enable row level security;

create table if not exists public.beta_gift_documentos (
  id uuid primary key default gen_random_uuid(),
  gift_id bigint not null,
  codigo text not null,
  storage_path text not null unique,
  bytes integer,
  nombre text,
  creado_por text,
  created_at timestamptz not null default now()
);
create index if not exists beta_gift_documentos_gift on public.beta_gift_documentos (gift_id);
alter table public.beta_gift_documentos enable row level security;
