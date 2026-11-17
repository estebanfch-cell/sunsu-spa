-- 20261117_migo_historial.sql
-- Historial de ventas Migo (marzo 2025–abril 2026) para rellenar el dashboard
-- en los meses que el sistema no tiene. Tablas beta_* aditivas: no toca
-- tickets, catálogo, hojas ni Apps Script.
-- No guarda cédulas, teléfonos ni correos: solo el nombre del cliente.

create table if not exists public.beta_migo_facturas (
  factura text primary key,
  fecha date not null,
  hora time,
  cliente text,
  subtotal numeric not null default 0,
  descuento numeric not null default 0,
  iva numeric not null default 0,
  total numeric not null default 0,
  retencion numeric not null default 0,
  total_pagar numeric not null default 0,
  formas_pago jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.beta_migo_lineas (
  id bigserial primary key,
  factura text not null references public.beta_migo_facturas(factura) on delete cascade,
  fecha date not null,
  codigo text,
  producto text,
  tipo text not null check (tipo in ('facial','servicio','paquete','producto','gift_card','other')),
  cantidad numeric not null default 0,
  precio_unit numeric not null default 0,
  subtotal numeric not null default 0,
  iva numeric not null default 0,
  total numeric not null default 0,
  vendedor text
);

create index if not exists beta_migo_facturas_fecha_idx on public.beta_migo_facturas (fecha);
create index if not exists beta_migo_lineas_fecha_idx on public.beta_migo_lineas (fecha);
create index if not exists beta_migo_lineas_factura_idx on public.beta_migo_lineas (factura);
create index if not exists beta_migo_lineas_tipo_idx on public.beta_migo_lineas (tipo);

comment on table public.beta_migo_facturas is
  'Facturas Migo históricas (marzo 2025–abril 2026). Solo nombre del cliente, sin cédulas/teléfonos/correos.';
comment on table public.beta_migo_lineas is
  'Líneas de producto de facturas Migo históricas, clasificadas contra el catálogo (facial, servicio, paquete, producto, gift_card, other).';
comment on column public.beta_migo_facturas.formas_pago is
  'Lista JSON de {forma, valor} por cobro. Facturas con pago mixto quedan en una sola fila.';
comment on column public.beta_migo_lineas.tipo is
  'facial | servicio | paquete | producto | gift_card | other';

alter table public.beta_migo_facturas enable row level security;
alter table public.beta_migo_lineas enable row level security;

grant select, insert, update, delete, references, trigger, truncate
  on public.beta_migo_facturas to anon, authenticated, service_role;
grant select, insert, update, delete, references, trigger, truncate
  on public.beta_migo_lineas to anon, authenticated, service_role;
grant usage, select on sequence public.beta_migo_lineas_id_seq to anon, authenticated, service_role;

drop policy if exists beta_migo_facturas_select on public.beta_migo_facturas;
create policy beta_migo_facturas_select on public.beta_migo_facturas
  for select to anon, authenticated, service_role using (true);

drop policy if exists beta_migo_lineas_select on public.beta_migo_lineas;
create policy beta_migo_lineas_select on public.beta_migo_lineas
  for select to anon, authenticated, service_role using (true);

create or replace view public.beta_historial_mensual as
with fac as (
  select
    date_trunc('month', fecha)::date as mes_fecha,
    count(*)::int as n_facturas
  from public.beta_migo_facturas
  group by 1
), lin as (
  select
    date_trunc('month', fecha)::date as mes_fecha,
    round(sum(subtotal), 2) as venta_sin_iva,
    coalesce(sum(cantidad) filter (where tipo = 'facial'), 0) as n_faciales,
    coalesce(sum(cantidad) filter (where tipo = 'paquete'), 0) as n_paquetes_vendidos,
    coalesce(sum(cantidad) filter (where tipo = 'producto'), 0) as n_productos
  from public.beta_migo_lineas
  group by 1
)
select
  extract(year from coalesce(fac.mes_fecha, lin.mes_fecha))::int as anio,
  extract(month from coalesce(fac.mes_fecha, lin.mes_fecha))::int as mes,
  coalesce(fac.mes_fecha, lin.mes_fecha) as mes_fecha,
  coalesce(lin.venta_sin_iva, 0) as venta_sin_iva,
  coalesce(lin.n_faciales, 0) as n_faciales,
  coalesce(lin.n_paquetes_vendidos, 0) as n_paquetes_vendidos,
  coalesce(lin.n_productos, 0) as n_productos,
  coalesce(fac.n_facturas, 0) as n_facturas
from fac
full outer join lin using (mes_fecha)
order by 1, 2;

comment on view public.beta_historial_mensual is
  'Resumen mensual del historial Migo. venta_sin_iva = suma de subtotales de línea (ya con descuento de línea). n_faciales, n_paquetes_vendidos y n_productos = suma de cantidades de líneas de ese tipo (no tickets). n_facturas = facturas únicas del mes.';

grant select on public.beta_historial_mensual to anon, authenticated, service_role;

notify pgrst, 'reload schema';
