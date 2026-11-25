-- DEV-31c · Estado del rol ante Contabilidad (opcional). Aditivo: solo columnas nuevas y nulas en beta_roles.
alter table public.beta_roles add column if not exists contab_estado text;
alter table public.beta_roles add column if not exists contab_por text;
alter table public.beta_roles add column if not exists contab_at timestamptz;
