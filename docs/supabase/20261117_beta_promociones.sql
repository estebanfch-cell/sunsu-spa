-- TK31 Promociones de la beta (Emilia 17/11): una promo (ej. «Black Friday») con varias reglas y vigencia.
-- Aditivo: tabla nueva beta_promociones + columna nueva beta_ticket_lineas.promo (etiqueta de la promo en la línea).
-- La hoja 🎉 PROMOS (tabla espejo public.promos) no cambia: la beta solo la lee para importar.
create table if not exists public.beta_promociones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  desde date not null,
  hasta date not null,
  activa boolean not null default true,
  reglas jsonb not null default '[]'::jsonb,
  notas text,
  origen text not null default 'beta',
  sheet_row integer,
  creado_por text,
  historial jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists beta_promociones_vigencia on public.beta_promociones (activa, desde, hasta);
alter table public.beta_promociones enable row level security;
alter table public.beta_ticket_lineas add column if not exists promo text;
