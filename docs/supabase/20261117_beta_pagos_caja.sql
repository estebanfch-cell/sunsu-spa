-- TK19 Pagos + caja chica (beta). Solo tablas nuevas beta_*: la sync de la hoja no las toca.
-- La caja vieja (caja_chica, de la hoja) queda solo de lectura para la beta.
create table if not exists public.beta_pagos (
  id uuid primary key default gen_random_uuid(),
  ticket_clave text not null,
  ticket_id bigint,
  fecha timestamptz not null default now(),
  metodo text not null check (metodo in ('efectivo','tarjeta','transferencia','gift_card','deuna','otro')),
  monto numeric(12,2) not null check (monto > 0),
  ref text,
  nota text,
  registrado_por text,
  caja_mov_id uuid,
  anulado boolean not null default false,
  anulado_por text,
  anulado_motivo text,
  anulado_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists beta_pagos_ticket_idx on public.beta_pagos (ticket_clave);
create index if not exists beta_pagos_fecha_idx on public.beta_pagos (fecha);

create table if not exists public.beta_caja_movimientos (
  id uuid primary key default gen_random_uuid(),
  fecha timestamptz not null default now(),
  tipo text not null check (tipo in ('apertura','ingreso','gasto','deposito','propina_entrada','propina_pago','efectivo_ticket','ajuste','cuadre')),
  categoria text,
  entrada numeric(12,2) not null default 0 check (entrada >= 0),
  salida numeric(12,2) not null default 0 check (salida >= 0),
  detalle text,
  quien text,
  ref text,
  comprobante_id text,
  registrado_por text,
  anulado boolean not null default false,
  anulado_por text,
  anulado_motivo text,
  anulado_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists beta_caja_mov_fecha_idx on public.beta_caja_movimientos (fecha);
create index if not exists beta_caja_mov_ref_idx on public.beta_caja_movimientos (ref);

create table if not exists public.beta_caja_cierres (
  id uuid primary key default gen_random_uuid(),
  fecha timestamptz not null default now(),
  saldo_sistema numeric(12,2) not null,
  contado numeric(12,2) not null,
  diferencia numeric(12,2) not null,
  ajuste_id uuid,
  nota text,
  cerrado_por text,
  created_at timestamptz not null default now()
);

alter table public.beta_pagos enable row level security;
alter table public.beta_caja_movimientos enable row level security;
alter table public.beta_caja_cierres enable row level security;
