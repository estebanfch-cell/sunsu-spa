-- TK11 (Emilia 17/11): Multas de la beta. Aditivo: catálogo de tipos + multas propias (la hoja no las toca).
-- El rol de pago suma estas multas a las del sistema central (multas_descuentos) en el mismo corte 26→25.
create table if not exists public.beta_multa_tipos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  monto numeric not null default 0,
  activo boolean not null default true,
  orden integer not null default 0,
  actualizado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists beta_multa_tipos_nombre_uq on public.beta_multa_tipos (lower(nombre));
alter table public.beta_multa_tipos enable row level security;

insert into public.beta_multa_tipos (nombre, monto, orden, actualizado_por)
select v.nombre, v.monto, v.orden, 'seed' from (values
  ('Clienta insatisfecha', 10, 1), ('Clienta reclamó', 10, 2), ('No limpió bien', 5, 3), ('Clienta mal agendada', 5, 4)
) as v(nombre, monto, orden)
where not exists (select 1 from public.beta_multa_tipos t where lower(t.nombre) = lower(v.nombre));

create table if not exists public.beta_multas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  persona text not null,
  tipo_id uuid,
  tipo text not null default '',
  monto numeric not null default 0,
  motivo text not null default '',
  ticket_id bigint,
  ticket_so text,
  estado text not null default 'activa',
  anulada_motivo text,
  anulada_por text,
  anulada_ts timestamptz,
  creado_por text,
  historial jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists beta_multas_fecha_idx on public.beta_multas (fecha);
create index if not exists beta_multas_ticket_idx on public.beta_multas (ticket_id);
alter table public.beta_multas enable row level security;
