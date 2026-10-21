-- COPIA de referencia. YA APLICADA en el proyecto Supabase.
-- No poner este archivo en supabase/migrations (se re-aplicaría).

-- Sunsu Spa: Google Sheets -> Supabase, fase 1 (espejo 1:1 por pestaña). sheet_row = fila real en la hoja; orig = fila original (header->valor).

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;

create table if not exists public.rrhh_empleadas (
  id bigserial primary key,
  sheet_row integer not null unique,
  "nombre_jibble" text,
  "nombre_app" text,
  "apellidos_y_nombres" text,
  "cedula" numeric,
  "cargo" text,
  "fecha_ingreso" timestamptz,
  "sueldo_base" numeric,
  "bono_fijo" numeric,
  "jornada" text,
  "fondo_reserva" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.rrhh_empleadas is 'Sheet tab: 👤 EMPLEADAS';
alter table public.rrhh_empleadas enable row level security;
drop trigger if exists trg_rrhh_empleadas_upd on public.rrhh_empleadas;
create trigger trg_rrhh_empleadas_upd before update on public.rrhh_empleadas for each row execute function public.set_updated_at();

create table if not exists public.rrhh_historial (
  id bigserial primary key,
  sheet_row integer not null unique,
  "mes" text,
  "ano" numeric,
  "empleada" text,
  "cedula" text,
  "sueldo" numeric,
  "bono" numeric,
  "comisiones" numeric,
  "extras_m_o_q" numeric,
  "c_13_14_fr_r_s_t" numeric,
  "total_ingresos_u" numeric,
  "iess_patronal_11_15" numeric,
  "costo_empresa" numeric,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.rrhh_historial is 'Sheet tab: HISTORIAL';
alter table public.rrhh_historial enable row level security;
drop trigger if exists trg_rrhh_historial_upd on public.rrhh_historial;
create trigger trg_rrhh_historial_upd before update on public.rrhh_historial for each row execute function public.set_updated_at();

create table if not exists public.rrhh_sync_config (
  id bigserial primary key,
  sheet_row integer not null unique,
  "col_1" text,
  "col_2" text,
  "col_3" text,
  "col_4" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.rrhh_sync_config is 'Sheet tab: ⚙ SYNC_CONFIG';
alter table public.rrhh_sync_config enable row level security;
drop trigger if exists trg_rrhh_sync_config_upd on public.rrhh_sync_config;
create trigger trg_rrhh_sync_config_upd before update on public.rrhh_sync_config for each row execute function public.set_updated_at();

create table if not exists public.rrhh_rol_2026_09 (
  id bigserial primary key,
  sheet_row integer not null unique,
  "col_1" text,
  "col_2" text,
  "col_3" text,
  "col_4" text,
  "col_5" text,
  "col_6" text,
  "col_7" text,
  "col_8" text,
  "col_9" text,
  "col_10" text,
  "col_11" text,
  "col_12" text,
  "col_13" text,
  "col_14" text,
  "col_15" text,
  "col_16" text,
  "col_17" text,
  "col_18" text,
  "col_19" text,
  "col_20" text,
  "col_21" text,
  "col_22" text,
  "col_23" text,
  "col_24" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.rrhh_rol_2026_09 is 'Sheet tab: SEPTIEMBRE_2026';
alter table public.rrhh_rol_2026_09 enable row level security;
drop trigger if exists trg_rrhh_rol_2026_09_upd on public.rrhh_rol_2026_09;
create trigger trg_rrhh_rol_2026_09_upd before update on public.rrhh_rol_2026_09 for each row execute function public.set_updated_at();

create table if not exists public.rrhh_rol_2026_08 (
  id bigserial primary key,
  sheet_row integer not null unique,
  "col_1" text,
  "col_2" text,
  "col_3" text,
  "col_4" text,
  "col_5" text,
  "col_6" text,
  "col_7" text,
  "col_8" text,
  "col_9" text,
  "col_10" text,
  "col_11" text,
  "col_12" text,
  "col_13" text,
  "col_14" text,
  "col_15" text,
  "col_16" text,
  "col_17" text,
  "col_18" text,
  "col_19" text,
  "col_20" text,
  "col_21" text,
  "col_22" text,
  "col_23" text,
  "col_24" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.rrhh_rol_2026_08 is 'Sheet tab: AGOSTO_2026';
alter table public.rrhh_rol_2026_08 enable row level security;
drop trigger if exists trg_rrhh_rol_2026_08_upd on public.rrhh_rol_2026_08;
create trigger trg_rrhh_rol_2026_08_upd before update on public.rrhh_rol_2026_08 for each row execute function public.set_updated_at();

create table if not exists public.rrhh_rol_2026_07 (
  id bigserial primary key,
  sheet_row integer not null unique,
  "col_1" text,
  "col_2" text,
  "col_3" text,
  "col_4" text,
  "col_5" text,
  "col_6" text,
  "col_7" text,
  "col_8" text,
  "col_9" text,
  "col_10" text,
  "col_11" text,
  "col_12" text,
  "col_13" text,
  "col_14" text,
  "col_15" text,
  "col_16" text,
  "col_17" text,
  "col_18" text,
  "col_19" text,
  "col_20" text,
  "col_21" text,
  "col_22" text,
  "col_23" text,
  "col_24" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.rrhh_rol_2026_07 is 'Sheet tab: JULIO_2026';
alter table public.rrhh_rol_2026_07 enable row level security;
drop trigger if exists trg_rrhh_rol_2026_07_upd on public.rrhh_rol_2026_07;
create trigger trg_rrhh_rol_2026_07_upd before update on public.rrhh_rol_2026_07 for each row execute function public.set_updated_at();

create table if not exists public.rrhh_rol_2026_06 (
  id bigserial primary key,
  sheet_row integer not null unique,
  "col_1" text,
  "col_2" text,
  "col_3" text,
  "col_4" text,
  "col_5" text,
  "col_6" text,
  "col_7" text,
  "col_8" text,
  "col_9" text,
  "col_10" text,
  "col_11" text,
  "col_12" text,
  "col_13" text,
  "col_14" text,
  "col_15" text,
  "col_16" text,
  "col_17" text,
  "col_18" text,
  "col_19" text,
  "col_20" text,
  "col_21" text,
  "col_22" text,
  "col_23" text,
  "col_24" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.rrhh_rol_2026_06 is 'Sheet tab: JUNIO_2026';
alter table public.rrhh_rol_2026_06 enable row level security;
drop trigger if exists trg_rrhh_rol_2026_06_upd on public.rrhh_rol_2026_06;
create trigger trg_rrhh_rol_2026_06_upd before update on public.rrhh_rol_2026_06 for each row execute function public.set_updated_at();

create table if not exists public.rrhh_rol_2026_05 (
  id bigserial primary key,
  sheet_row integer not null unique,
  "col_1" text,
  "col_2" text,
  "col_3" text,
  "col_4" text,
  "col_5" text,
  "col_6" text,
  "col_7" text,
  "col_8" text,
  "col_9" text,
  "col_10" text,
  "col_11" text,
  "col_12" text,
  "col_13" text,
  "col_14" text,
  "col_15" text,
  "col_16" text,
  "col_17" text,
  "col_18" text,
  "col_19" text,
  "col_20" text,
  "col_21" text,
  "col_22" text,
  "col_23" text,
  "col_24" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.rrhh_rol_2026_05 is 'Sheet tab: MAYO_2026';
alter table public.rrhh_rol_2026_05 enable row level security;
drop trigger if exists trg_rrhh_rol_2026_05_upd on public.rrhh_rol_2026_05;
create trigger trg_rrhh_rol_2026_05_upd before update on public.rrhh_rol_2026_05 for each row execute function public.set_updated_at();
