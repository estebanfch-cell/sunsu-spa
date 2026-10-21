-- COPIA de referencia. YA APLICADA en el proyecto Supabase.
-- No poner este archivo en supabase/migrations (se re-aplicaría).

-- Sunsu Spa: Google Sheets -> Supabase, fase 1 (espejo 1:1 por pestaña). sheet_row = fila real en la hoja; orig = fila original (header->valor).

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;

create table if not exists public.cabina_inventario (
  id bigserial primary key,
  sheet_row integer not null unique,
  "codigo" text,
  "producto" text,
  "proveedor" text,
  "contenido_envase" numeric,
  "unidad" text,
  "costo_envase" numeric,
  "costo_por_unidad" numeric,
  "envases_cerrados" numeric,
  "abierto_restante" numeric,
  "stock_total" numeric,
  "minimo_envases" numeric,
  "notas" text,
  "activo" text,
  "sku_catalogo" text,
  "bodega_cerrados" numeric,
  "codigo_barras" text,
  "producto_base" text,
  "ubicacion" text,
  "ubicacion_local" text,
  "ubicacion_abierto" text,
  "max_abiertos" numeric,
  "esterilizable" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.cabina_inventario is 'Sheet tab: 🧴 INVENTARIO CABINA';
alter table public.cabina_inventario enable row level security;
drop trigger if exists trg_cabina_inventario_upd on public.cabina_inventario;
create trigger trg_cabina_inventario_upd before update on public.cabina_inventario for each row execute function public.set_updated_at();

create table if not exists public.cabina_bitacora (
  id bigserial primary key,
  sheet_row integer not null unique,
  "id_1" text,
  "timestamp" text,
  "usuario" text,
  "items" text,
  "paso1_ok" text,
  "paso2_opcion" text,
  "paso2_ok" text,
  "paso3_ok" text,
  "resultado" text,
  "observacion_texto" text,
  "estado" text,
  "motivo_anulacion" text,
  "anulado_por" text,
  "anulado_ts" text,
  "registro_reemplazo_id" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.cabina_bitacora is 'Sheet tab: 📒 BITÁCORA ESTERILIZACIÓN';
alter table public.cabina_bitacora enable row level security;
drop trigger if exists trg_cabina_bitacora_upd on public.cabina_bitacora;
create trigger trg_cabina_bitacora_upd before update on public.cabina_bitacora for each row execute function public.set_updated_at();

create table if not exists public.cabina_traspasos (
  id bigserial primary key,
  sheet_row integer not null unique,
  "col_1" text,
  "fecha" timestamptz,
  "de_a" text,
  "items" text,
  "por" text,
  "notas" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.cabina_traspasos is 'Sheet tab: 🚚 TRASPASOS';
alter table public.cabina_traspasos enable row level security;
drop trigger if exists trg_cabina_traspasos_upd on public.cabina_traspasos;
create trigger trg_cabina_traspasos_upd before update on public.cabina_traspasos for each row execute function public.set_updated_at();

create table if not exists public.cabina_activos (
  id bigserial primary key,
  sheet_row integer not null unique,
  "codigo" text,
  "activo" text,
  "categoria" text,
  "cantidad" numeric,
  "ubicacion" text,
  "estado" text,
  "fecha_compra" timestamptz,
  "costo" numeric,
  "notas" text,
  "lugar" text,
  "codigo_barras" text,
  "proveedor" text,
  "cantidad_bodega" numeric,
  "unidad" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.cabina_activos is 'Sheet tab: 🛠 ACTIVOS';
alter table public.cabina_activos enable row level security;
drop trigger if exists trg_cabina_activos_upd on public.cabina_activos;
create trigger trg_cabina_activos_upd before update on public.cabina_activos for each row execute function public.set_updated_at();

create table if not exists public.cabina_protocolos (
  id bigserial primary key,
  sheet_row integer not null unique,
  "sku" text,
  "facial" text,
  "version" numeric,
  "vigente" text,
  "mano_de_obra" numeric,
  "video" text,
  "notas" text,
  "actualizado" timestamptz,
  "por" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.cabina_protocolos is 'Sheet tab: 📋 PROTOCOLOS';
alter table public.cabina_protocolos enable row level security;
drop trigger if exists trg_cabina_protocolos_upd on public.cabina_protocolos;
create trigger trg_cabina_protocolos_upd before update on public.cabina_protocolos for each row execute function public.set_updated_at();

create table if not exists public.cabina_protocolo_pasos (
  id bigserial primary key,
  sheet_row integer not null unique,
  "sku" text,
  "version" numeric,
  "paso" numeric,
  "descripcion" text,
  "producto_cod" text,
  "cantidad" numeric,
  "unidad" text,
  "minutos" numeric,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.cabina_protocolo_pasos is 'Sheet tab: 📝 PROTOCOLO PASOS';
alter table public.cabina_protocolo_pasos enable row level security;
drop trigger if exists trg_cabina_protocolo_pasos_upd on public.cabina_protocolo_pasos;
create trigger trg_cabina_protocolo_pasos_upd before update on public.cabina_protocolo_pasos for each row execute function public.set_updated_at();

create table if not exists public.cabina_consumos (
  id bigserial primary key,
  sheet_row integer not null unique,
  "fecha" timestamptz,
  "tk" timestamptz,
  "sku_facial" text,
  "version" text,
  "producto_cod" text,
  "producto" numeric,
  "cantidad" text,
  "unidad" text,
  "costo" text,
  "col_10" numeric,
  "col_11" text,
  "col_12" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.cabina_consumos is 'Sheet tab: 📉 CONSUMOS';
alter table public.cabina_consumos enable row level security;
drop trigger if exists trg_cabina_consumos_upd on public.cabina_consumos;
create trigger trg_cabina_consumos_upd before update on public.cabina_consumos for each row execute function public.set_updated_at();

create table if not exists public.cabina_aperturas (
  id bigserial primary key,
  sheet_row integer not null unique,
  "fecha" text,
  "producto_cod" timestamptz,
  "producto" text,
  "contenido" text,
  "quien" text,
  "col_6" text,
  "col_7" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.cabina_aperturas is 'Sheet tab: 🍾 APERTURAS';
alter table public.cabina_aperturas enable row level security;
drop trigger if exists trg_cabina_aperturas_upd on public.cabina_aperturas;
create trigger trg_cabina_aperturas_upd before update on public.cabina_aperturas for each row execute function public.set_updated_at();
