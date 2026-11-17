-- 0047: Ajustes de stock de la beta (Emilia 17/11, como MineCore inv_docs tipo ajuste). SOLO AGREGA tablas
-- beta_* (las escribe app_beta_write de 0045). Un ajuste aplicado escribe sus diferencias en
-- beta_stock_movimientos (0046). Nada en erp_stock, cabina_inventario ni la hoja.

create table if not exists public.beta_ajustes (
  id text primary key,
  numero text not null unique,
  bodega text not null check (bodega in ('CONSIGNACION','CABINA','OFICINA')),
  sububicacion text,
  motivo text not null,
  nota text,
  origen text not null default 'manual' check (origen in ('manual','ficha','conteo')),
  conteo_id text,
  estado text not null default 'pendiente' check (estado in ('pendiente','aplicado','rechazado','cancelado')),
  creado_por text, creado_at timestamptz not null default now(),
  aplicado_por text, aplicado_at timestamptz,
  rechazado_por text, rechazado_at timestamptz, motivo_rechazo text,
  updated_at timestamptz not null default now()
);
create table if not exists public.beta_ajuste_lineas (
  id text primary key,
  ajuste_id text not null references public.beta_ajustes(id) on delete cascade,
  orden integer not null default 0,
  producto_id text not null,
  sku text,
  nombre text,
  antes numeric not null default 0,
  despues numeric not null default 0,
  diferencia numeric not null
);
create index if not exists beta_aj_lineas_aj on public.beta_ajuste_lineas (ajuste_id, orden);
alter table public.beta_ajustes enable row level security;
alter table public.beta_ajuste_lineas enable row level security;
comment on table public.beta_ajustes is 'Ajustes de stock de la beta: admin aplica directo; los demás quedan pendientes hasta que un admin apruebe. Al aplicar escribe beta_stock_movimientos.';

do $$
declare t text;
begin
  if exists (select 1 from pg_proc where proname = 'audit_trigger') then
    foreach t in array array['beta_ajustes','beta_ajuste_lineas'] loop
      if not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = ('public.' || t)::regclass) then
        execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger(''id'')', t);
      end if;
    end loop;
  end if;
end $$;
