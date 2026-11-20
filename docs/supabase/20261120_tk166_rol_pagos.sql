-- TK166 · Rol de pagos (Emilia t758u/t760u/t763u).
-- 1) Respaldo antes de tocar nada del historial (solo lectura después: el historial pagado NO se modifica).
create table if not exists public.bk_tk166_rrhh_historial as select * from public.rrhh_historial;
create table if not exists public.bk_tk166_beta_empleados as select * from public.beta_empleados;
alter table public.bk_tk166_rrhh_historial enable row level security;
alter table public.bk_tk166_beta_empleados enable row level security;
revoke all on public.bk_tk166_rrhh_historial, public.bk_tk166_beta_empleados from anon, authenticated;

-- 2) Ficha: décimo tercero / cuarto / fondo de reserva mensualizados (true) o acumulados (false). Sin dato = mensual.
alter table public.beta_empleados add column if not exists dec13_mensual boolean;
alter table public.beta_empleados add column if not exists dec14_mensual boolean;
alter table public.beta_empleados add column if not exists fondo_mensual boolean;

-- 3) Detalle línea por línea de cada rol del Historial RRHH (comisiones por tipo, horas 50/100, 13°, 14°, fondo,
--    IESS, préstamos, multas), armado una sola vez desde la hoja del mes y congelado. Los totales pagados mandan.
create table if not exists public.beta_rol_hist_detalle (
  id uuid primary key default gen_random_uuid(),
  periodo text not null,
  cedula text not null,
  persona text,
  detalle jsonb not null,
  diferencias jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  origin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beta_rol_hist_detalle_uq unique (periodo, cedula)
);
alter table public.beta_rol_hist_detalle enable row level security;
revoke all on public.beta_rol_hist_detalle from anon, authenticated;
