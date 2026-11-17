-- Ajustes por persona que viven solo en la beta (el sync de la hoja no los toca).
-- Primero: color de la cosmetóloga (píldora). Después: permisos por usuario (datos).
create table if not exists public.beta_permisos_usuario (
  usuario text primary key,            -- nombre normalizado (minúsculas, sin tildes)
  nombre text,
  color text,                          -- #RRGGBB pastel
  datos jsonb not null default '{}'::jsonb,
  actualizado_por text,
  updated_at timestamptz not null default now()
);
alter table public.beta_permisos_usuario enable row level security;
