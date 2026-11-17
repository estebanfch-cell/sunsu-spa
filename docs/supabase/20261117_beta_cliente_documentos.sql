-- Documentos PDF de clientas (K-Lift simetría, Focus Skin) en el bucket privado «cliente-documentos».
-- Otro proceso carga los PDFs y llena esta tabla; la beta solo la lee. Aditivo: no toca nada si ya existe.
create table if not exists public.beta_cliente_documentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id text,
  cliente_nombre_archivo text,
  tipo text check (tipo in ('skin_analisis', 'klift')),
  fecha timestamptz,
  storage_path text not null,
  origen text,
  created_at timestamptz not null default now()
);
create index if not exists beta_cliente_documentos_cliente_idx on public.beta_cliente_documentos (cliente_id);
alter table public.beta_cliente_documentos enable row level security;
