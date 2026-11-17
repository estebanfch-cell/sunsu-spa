-- 0046: Transferencias de la beta (Emilia 17/11, como MineCore inv_docs tipo transfer). SOLO AGREGA
-- tablas beta_* nuevas (las escribe app_beta_write de 0045). El stock de la beta = stock del sistema
-- (hoja / Cabina / erp_stock, sin tocar) + beta_stock_movimientos. Nada se escribe en erp_stock,
-- cabina_inventario ni en la hoja.

create table if not exists public.beta_stock_movimientos (
  id text primary key,
  fecha timestamptz not null default now(),
  producto_id text not null,
  sku text,
  bodega text not null check (bodega in ('CONSIGNACION','CABINA','OFICINA')),
  sububicacion text,
  delta numeric not null,
  tipo text not null check (tipo in ('transferencia','ajuste','conteo')),
  doc_id text,
  doc_numero text,
  actor text,
  nota text
);
create index if not exists beta_stock_mov_producto on public.beta_stock_movimientos (producto_id, fecha);

create table if not exists public.beta_transferencias (
  id text primary key,
  numero text not null unique,
  origen text not null check (origen in ('CONSIGNACION','CABINA','OFICINA')),
  origen_sub text,
  destino text not null check (destino in ('CONSIGNACION','CABINA','OFICINA')),
  destino_sub text,
  estado text not null default 'borrador' check (estado in ('borrador','enviada','recibida','cancelada')),
  nota text,
  creado_por text, creado_at timestamptz not null default now(),
  enviado_por text, enviado_at timestamptz,
  recibido_por text, recibido_at timestamptz,
  cancelado_por text, cancelado_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.beta_transferencia_lineas (
  id text primary key,
  transferencia_id text not null references public.beta_transferencias(id) on delete cascade,
  orden integer not null default 0,
  producto_id text not null,
  sku text,
  nombre text,
  cantidad numeric not null check (cantidad > 0),
  disponible numeric
);
create index if not exists beta_trf_lineas_trf on public.beta_transferencia_lineas (transferencia_id, orden);
alter table public.beta_stock_movimientos enable row level security;
alter table public.beta_transferencias enable row level security;
alter table public.beta_transferencia_lineas enable row level security;
comment on table public.beta_stock_movimientos is 'Kardex de la beta: deltas de stock por bodega/sububicación (transferencias, ajustes). Stock beta = stock del sistema + estos movimientos.';
comment on table public.beta_transferencias is 'Transferencias de la beta: borrador → enviada → recibida (o cancelada). El stock se mueve solo al recibir, en beta_stock_movimientos.';

do $$
declare t text;
begin
  if exists (select 1 from pg_proc where proname = 'audit_trigger') then
    foreach t in array array['beta_transferencias','beta_transferencia_lineas','beta_stock_movimientos'] loop
      if not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = ('public.' || t)::regclass) then
        execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger(''id'')', t);
      end if;
    end loop;
  end if;
end $$;
