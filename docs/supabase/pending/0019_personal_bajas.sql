-- 0019_personal_bajas.sql — idempotente. Personas que ya no trabajan en Sunsu.
-- Tabla propia de la beta (no viene de la hoja): el import horario no la toca.
-- El historial (tickets, comisiones, roles, asistencia) queda con su nombre.
create table if not exists public.personal_bajas (
  nombre text primary key, nombre_app text, cedula text, fecha_salida date, motivo text, creado_por text,
  created_at timestamptz not null default now()
);
alter table public.personal_bajas enable row level security;
grant select, insert, update, delete on public.personal_bajas to sunsu_admin, sunsu_rls;
drop policy if exists p_admin on public.personal_bajas;
create policy p_admin on public.personal_bajas for all to sunsu_admin using (true) with check (true);
