-- Login con usuario + contraseña (Emilia 17/11), al lado del PIN (el PIN sigue igual).
-- Solo hash PBKDF2-SHA256 + sal; nunca la contraseña. Aditivo.
create table if not exists public.beta_credenciales (
  usuario_id text primary key,
  usuario text not null,
  pass_hash text not null,
  pass_salt text not null,
  iteraciones integer not null default 120000,
  intentos integer not null default 0,
  bloqueado_hasta timestamptz,
  actualizado_por text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists beta_credenciales_usuario_idx on public.beta_credenciales (lower(usuario));
alter table public.beta_credenciales enable row level security;
