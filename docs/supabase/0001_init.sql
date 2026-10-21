-- COPIA de referencia. YA APLICADA en el proyecto Supabase.
-- No poner este archivo en supabase/migrations (se re-aplicaría).

-- Sunsu Spa: Google Sheets -> Supabase, fase 1 (espejo 1:1 por pestaña). sheet_row = fila real en la hoja; orig = fila original (header->valor).

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;

create table if not exists public.tickets (
  id bigserial primary key,
  sheet_row integer not null unique,
  "timestamp" timestamptz,
  "atendido_por" text,
  "id_3" text,
  "nombre" text,
  "apellido" text,
  "fac" boolean,
  "fac_7" text,
  "cob" boolean,
  "comp" text,
  "estimado" numeric,
  "fecha_retorno" text,
  "agendado" boolean,
  "estado" text,
  "recomendaciones" text,
  "notas_generales" text,
  "efch" boolean,
  "paquete" text,
  "gift_card" text,
  "venta_gift" text,
  "facial_hecho" text,
  "compra_pack_3" text,
  "compra_pack_6" text,
  "servicios_adicionales" text,
  "column_53" text,
  "ht_002" numeric,
  "ht_003" numeric,
  "ht_004" numeric,
  "ht_006" numeric,
  "ht_007" numeric,
  "ht_010" numeric,
  "ht_011" numeric,
  "ht_012" text,
  "ht_013" numeric,
  "ht_014" numeric,
  "as_001" numeric,
  "as_002" numeric,
  "as_003" numeric,
  "as_004" numeric,
  "as_005" numeric,
  "as_006" numeric,
  "as_007" numeric,
  "as_009" numeric,
  "as_010" numeric,
  "ml_001" numeric,
  "ml_002" numeric,
  "ml_003" text,
  "ml_004" numeric,
  "ml_005" numeric,
  "ml_007" numeric,
  "ml_008" numeric,
  "ml_009" numeric,
  "ml_010" numeric,
  "ml_011" numeric,
  "ml_012" text,
  "ml_013" numeric,
  "ml_014" text,
  "ph_001" numeric,
  "ph_002" numeric,
  "ph_003" numeric,
  "ph_004" text,
  "ph_007" numeric,
  "ph_008" numeric,
  "ph_005" text,
  "jn_001" numeric,
  "jn_002" numeric,
  "jn_003" numeric,
  "jn_004" text,
  "jn_005" numeric,
  "jn_006" numeric,
  "jn_007" text,
  "jn_008" numeric,
  "jn_009" numeric,
  "bv_001" numeric,
  "su_001" numeric,
  "su_002" numeric,
  "su_003" numeric,
  "su_004" text,
  "su_005" numeric,
  "su_006" numeric,
  "su_007" numeric,
  "su_008" numeric,
  "su_009" numeric,
  "vk_001" numeric,
  "vk_002" numeric,
  "vk_003" numeric,
  "vk_004" numeric,
  "vk_005" numeric,
  "vk_006" text,
  "vk_007" numeric,
  "vk_008" text,
  "vk_009" numeric,
  "vk_010" numeric,
  "vk_011" text,
  "vk_012" numeric,
  "vk_013" numeric,
  "vk_014" numeric,
  "vk_015" numeric,
  "vk_016" numeric,
  "vk_017" numeric,
  "excluir_facial" boolean,
  "excluir_paquete" boolean,
  "excluir_producto" boolean,
  "excluir_extras" boolean,
  "seguimiento" text,
  "comprobante" text,
  "fotos" text,
  "fotos_antes" text,
  "fotos_despues" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.tickets is 'Sheet tab: 🎫 TICKET_FICHA';
alter table public.tickets enable row level security;
drop trigger if exists trg_tickets_upd on public.tickets;
create trigger trg_tickets_upd before update on public.tickets for each row execute function public.set_updated_at();

create table if not exists public.clientas_registro (
  id bigserial primary key,
  sheet_row integer not null unique,
  "timestamp" timestamptz,
  "cedula" text,
  "nombre" text,
  "apellido" text,
  "fecha_de_nacimiento" timestamptz,
  "column_19" timestamptz,
  "column_18" numeric,
  "sector_donde_vive" text,
  "tipo_de_piel" text,
  "estado_actual" text,
  "alergias" text,
  "medicacion" text,
  "condiciones_medicas_o_dermatologicas_que_debamos_saber" text,
  "reacciones_previas_a_tratamientos" text,
  "uso_de_exfoliantes_retintines" text,
  "ciclo_mestrual_si_aplica" text,
  "deseas_extracciones_de_comedones_o_espinillas_si_es_nec" text,
  "cortesia_complementaria" text,
  "apruebo_consentimiento_individual" text,
  "telefono" text,
  "autoriza_fotos" text,
  "firma" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.clientas_registro is 'Sheet tab: REGISTRO';
alter table public.clientas_registro enable row level security;
drop trigger if exists trg_clientas_registro_upd on public.clientas_registro;
create trigger trg_clientas_registro_upd before update on public.clientas_registro for each row execute function public.set_updated_at();

create table if not exists public.clientas_antiguas (
  id bigserial primary key,
  sheet_row integer not null unique,
  "cedula" text,
  "nombre" text,
  "telefono" text,
  "email" text,
  "ultima_visita" text,
  "visitas" numeric,
  "contactada_por" text,
  "fecha_contacto" text,
  "estado" text,
  "intentos" text,
  "tel_acuity" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.clientas_antiguas is 'Sheet tab: 📜 CLIENTAS ANTIGUAS';
alter table public.clientas_antiguas enable row level security;
drop trigger if exists trg_clientas_antiguas_upd on public.clientas_antiguas;
create trigger trg_clientas_antiguas_upd before update on public.clientas_antiguas for each row execute function public.set_updated_at();

create table if not exists public.paquetes (
  id bigserial primary key,
  sheet_row integer not null unique,
  "dia" numeric,
  "mes" numeric,
  "ano" numeric,
  "cedula" text,
  "nombres" text,
  "apellidos" text,
  "factura" text,
  "sku" text,
  "paquete" text,
  "vendido_por" text,
  "uso_1" boolean,
  "fecha_1" text,
  "uso_2" boolean,
  "fecha_2" text,
  "uso_3" boolean,
  "fecha_3" text,
  "uso4" boolean,
  "fecha_4" text,
  "uso_5" boolean,
  "fecha_5" text,
  "uso_6" boolean,
  "fecha_6" text,
  "saldo_a_favor" text,
  "completo" boolean,
  "notas" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.paquetes is 'Sheet tab: 📋 PAQUETES';
alter table public.paquetes enable row level security;
drop trigger if exists trg_paquetes_upd on public.paquetes;
create trigger trg_paquetes_upd before update on public.paquetes for each row execute function public.set_updated_at();

create table if not exists public.gift_cards (
  id bigserial primary key,
  sheet_row integer not null unique,
  "codigo_gc" text,
  "dia" numeric,
  "mes" numeric,
  "ano" numeric,
  "cedula_comprador" text,
  "nombre_comprador" text,
  "apellido_comprador" text,
  "factura" text,
  "sku" text,
  "valor" text,
  "usado" boolean,
  "fecha_uso" text,
  "usado_por" text,
  "notas" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.gift_cards is 'Sheet tab: 🎁 GIFT CARDS';
alter table public.gift_cards enable row level security;
drop trigger if exists trg_gift_cards_upd on public.gift_cards;
create trigger trg_gift_cards_upd before update on public.gift_cards for each row execute function public.set_updated_at();

create table if not exists public.historial_ventas (
  id bigserial primary key,
  sheet_row integer not null unique,
  "dia" numeric,
  "mes" numeric,
  "ano" numeric,
  "cedula_ruc" text,
  "nombres" text,
  "apellidos" text,
  "factura" text,
  "sku" text,
  "producto_servicio" text,
  "forma_pago" text,
  "cosmetologa" text,
  "notas" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.historial_ventas is 'Sheet tab: 🧾 HISTORIAL';
alter table public.historial_ventas enable row level security;
drop trigger if exists trg_historial_ventas_upd on public.historial_ventas;
create trigger trg_historial_ventas_upd before update on public.historial_ventas for each row execute function public.set_updated_at();

create table if not exists public.catalogo (
  id bigserial primary key,
  sheet_row integer not null unique,
  "sku" text,
  "producto_servicio" text,
  "tipo" text,
  "subtotal" numeric,
  "iva" numeric,
  "total_con_iva" numeric,
  "precio_compra" text,
  "utilidad" text,
  "comi_producto_30" text,
  "activo" boolean,
  "col_17" numeric,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.catalogo is 'Sheet tab: 📦 CATALOGO';
alter table public.catalogo enable row level security;
drop trigger if exists trg_catalogo_upd on public.catalogo;
create trigger trg_catalogo_upd before update on public.catalogo for each row execute function public.set_updated_at();

create table if not exists public.inventario_entradas (
  id bigserial primary key,
  sheet_row integer not null unique,
  "timestamp" text,
  "sku" text,
  "producto" text,
  "proveedor" text,
  "cant_pedida" numeric,
  "cant_recibida_llenar_aqui" numeric,
  "estado_automatico" text,
  "orden" text,
  "notas" text,
  "registrado_por" text,
  "col_11" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.inventario_entradas is 'Sheet tab: 📥 ENTRADAS';
alter table public.inventario_entradas enable row level security;
drop trigger if exists trg_inventario_entradas_upd on public.inventario_entradas;
create trigger trg_inventario_entradas_upd before update on public.inventario_entradas for each row execute function public.set_updated_at();

create table if not exists public.inventario_fisico (
  id bigserial primary key,
  sheet_row integer not null unique,
  "fecha" timestamptz,
  "usuario" text,
  "sku" text,
  "producto" text,
  "stock_sistema" numeric,
  "conteo_fisico" numeric,
  "diferencia" numeric,
  "estado" text,
  "col_9" timestamptz,
  "col_10" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.inventario_fisico is 'Sheet tab: 📋 INV FÍSICO';
alter table public.inventario_fisico enable row level security;
drop trigger if exists trg_inventario_fisico_upd on public.inventario_fisico;
create trigger trg_inventario_fisico_upd before update on public.inventario_fisico for each row execute function public.set_updated_at();

create table if not exists public.proveedores (
  id bigserial primary key,
  sheet_row integer not null unique,
  "nombre" text,
  "ruc" text,
  "telefono" text,
  "direccion" text,
  "email" text,
  "familia" text,
  "notas" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.proveedores is 'Sheet tab: 🏭 PROVEEDORES';
alter table public.proveedores enable row level security;
drop trigger if exists trg_proveedores_upd on public.proveedores;
create trigger trg_proveedores_upd before update on public.proveedores for each row execute function public.set_updated_at();

create table if not exists public.ordenes_compra (
  id bigserial primary key,
  sheet_row integer not null unique,
  "numorden" text,
  "fecha" text,
  "proveedor" text,
  "json" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.ordenes_compra is 'Sheet tab: OC_DATA';
alter table public.ordenes_compra enable row level security;
drop trigger if exists trg_ordenes_compra_upd on public.ordenes_compra;
create trigger trg_ordenes_compra_upd before update on public.ordenes_compra for each row execute function public.set_updated_at();

create table if not exists public.promos (
  id bigserial primary key,
  sheet_row integer not null unique,
  "nombre" text,
  "aplica_a" text,
  "tipo" text,
  "valor" numeric,
  "desde" timestamptz,
  "hasta" timestamptz,
  "creada_por" text,
  "activa" text,
  "codigos" text,
  "valor2" numeric,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.promos is 'Sheet tab: 🎉 PROMOS';
alter table public.promos enable row level security;
drop trigger if exists trg_promos_upd on public.promos;
create trigger trg_promos_upd before update on public.promos for each row execute function public.set_updated_at();

create table if not exists public.propinas (
  id bigserial primary key,
  sheet_row integer not null unique,
  "fecha" text,
  "cosmetologa" text,
  "monto" numeric,
  "via" text,
  "nota" text,
  "estado" text,
  "pagada_el" text,
  "registro" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.propinas is 'Sheet tab: 💝 PROPINAS';
alter table public.propinas enable row level security;
drop trigger if exists trg_propinas_upd on public.propinas;
create trigger trg_propinas_upd before update on public.propinas for each row execute function public.set_updated_at();

create table if not exists public.envios_tarjetas (
  id bigserial primary key,
  sheet_row integer not null unique,
  "fecha_envio" timestamptz,
  "clienta" text,
  "cedula" text,
  "telefono" text,
  "que_se_envio" text,
  "fecha_del_ticket" timestamptz,
  "enviado_por" text,
  "clave" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.envios_tarjetas is 'Sheet tab: 📤 ENVÍOS TARJETAS';
alter table public.envios_tarjetas enable row level security;
drop trigger if exists trg_envios_tarjetas_upd on public.envios_tarjetas;
create trigger trg_envios_tarjetas_upd before update on public.envios_tarjetas for each row execute function public.set_updated_at();

create table if not exists public.roles_aprobados (
  id bigserial primary key,
  sheet_row integer not null unique,
  "fecha" timestamptz,
  "rol_mes" text,
  "cedula" numeric,
  "nombre" text,
  "aprobado_desde" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.roles_aprobados is 'Sheet tab: ✅ ROLES APROBADOS';
alter table public.roles_aprobados enable row level security;
drop trigger if exists trg_roles_aprobados_upd on public.roles_aprobados;
create trigger trg_roles_aprobados_upd before update on public.roles_aprobados for each row execute function public.set_updated_at();

create table if not exists public.multas_descuentos (
  id bigserial primary key,
  sheet_row integer not null unique,
  "fecha" timestamptz,
  "cosmetologa" text,
  "tipo" text,
  "monto" numeric,
  "motivo" text,
  "col_6" numeric,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.multas_descuentos is 'Sheet tab: 📋 MULTAS Y DESCUENTOS';
alter table public.multas_descuentos enable row level security;
drop trigger if exists trg_multas_descuentos_upd on public.multas_descuentos;
create trigger trg_multas_descuentos_upd before update on public.multas_descuentos for each row execute function public.set_updated_at();

create table if not exists public.permisos (
  id bigserial primary key,
  sheet_row integer not null unique,
  "id_1" numeric,
  "empleada" text,
  "tipo" text,
  "fecha_inicio" timestamptz,
  "fecha_fin" timestamptz,
  "horas" numeric,
  "motivo" text,
  "estado" text,
  "solicitado" timestamptz,
  "aprobado_por" text,
  "url_certificado" text,
  "ingresado_en_jibble" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.permisos is 'Sheet tab: 🏖️ PERMISOS';
alter table public.permisos enable row level security;
drop trigger if exists trg_permisos_upd on public.permisos;
create trigger trg_permisos_upd before update on public.permisos for each row execute function public.set_updated_at();

create table if not exists public.caja_chica (
  id bigserial primary key,
  sheet_row integer not null unique,
  "fecha_hora" text,
  "tipo" text,
  "detalle_justificativo" text,
  "quien" text,
  "entrada" numeric,
  "salida" numeric,
  "saldo" numeric,
  "ref" text,
  "registrado_por" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.caja_chica is 'Sheet tab: 💵 CAJA CHICA V2';
alter table public.caja_chica enable row level security;
drop trigger if exists trg_caja_chica_upd on public.caja_chica;
create trigger trg_caja_chica_upd before update on public.caja_chica for each row execute function public.set_updated_at();

create table if not exists public.log_acciones (
  id bigserial primary key,
  sheet_row integer not null unique,
  "fecha" text,
  "usuario" text,
  "accion" text,
  "detalle" text,
  orig jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.log_acciones is 'Sheet tab: 📜 LOG';
alter table public.log_acciones enable row level security;
drop trigger if exists trg_log_acciones_upd on public.log_acciones;
create trigger trg_log_acciones_upd before update on public.log_acciones for each row execute function public.set_updated_at();

create table if not exists public.configuracion (
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
comment on table public.configuracion is 'Sheet tab: ⚙ CONFIGURACION';
alter table public.configuracion enable row level security;
drop trigger if exists trg_configuracion_upd on public.configuracion;
create trigger trg_configuracion_upd before update on public.configuracion for each row execute function public.set_updated_at();

create index if not exists tickets_id_3_idx on public.tickets ("id_3");

create index if not exists clientas_registro_cedula_idx on public.clientas_registro ("cedula");

create index if not exists clientas_antiguas_cedula_idx on public.clientas_antiguas ("cedula");

create index if not exists paquetes_cedula_idx on public.paquetes ("cedula");

create index if not exists historial_ventas_cedula_ruc_idx on public.historial_ventas ("cedula_ruc");

create index if not exists gift_cards_codigo_gc_idx on public.gift_cards ("codigo_gc");

create index if not exists catalogo_sku_idx on public.catalogo ("sku");

create index if not exists inventario_entradas_sku_idx on public.inventario_entradas ("sku");
