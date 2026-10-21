-- COPIA de referencia. YA APLICADA en el proyecto Supabase.
-- No poner este archivo en supabase/migrations (se re-aplicaría).

-- 0002: reglas de negocio en la BD (no destructivo: solo crea objetos nuevos)
-- Nota: los timestamps importados de la hoja son hora local Ecuador guardada como si fuera UTC.
-- La función ts_local() los devuelve como hora local "naive" (igual a la que se ve en la hoja).
create or replace function public.ts_local(t timestamptz) returns timestamp language sql immutable as $$ select t at time zone 'UTC' $$;

-- Ciclo de comisiones 26 → 25: devuelve el día 26 que abre el ciclo de una fecha
create or replace function public.ciclo_inicio(d date) returns date language sql immutable as $$
  select case when extract(day from d) >= 26 then make_date(extract(year from d)::int, extract(month from d)::int, 26)
              else (make_date(extract(year from d)::int, extract(month from d)::int, 26) - interval '1 month')::date end $$;

-- Constantes (antes en CONFIG del Apps Script)
create table if not exists public.config_comisiones (
  id int primary key default 1 check (id = 1),
  min_clientas_bono int not null default 60,
  com_facial_2 numeric not null default 2, faciales_2 text[] not null default '{SUNSU-01,SUNSU-02,SUNSU-03,SUNSU-04,SUNSU-05,SUNSU-06}',
  com_facial_3 numeric not null default 3, faciales_3 text[] not null default '{SUNSU-40,SUNSU-41,SUNSU-42,SUNSU-43,SUNSU-52,SUNSU-57}',
  com_extra numeric not null default 1, pct_com_producto numeric not null default 0.30,
  recep_com_por_clienta numeric not null default 0.50, recep_min int not null default 10, recep_min_lunes int not null default 5,
  cedula_interna text not null default '1793219469001',
  updated_at timestamptz not null default now());
insert into public.config_comisiones (id) values (1) on conflict do nothing;

create table if not exists public.niveles_paquetes (
  nivel int primary key, pct numeric not null, premio numeric not null);
insert into public.niveles_paquetes values
 (1,0.05,5),(2,0.10,20),(3,0.15,45),(4,0.20,80),(5,0.25,125),(6,0.30,180),(7,0.40,245),(8,0.50,320),(9,0.60,405),(10,0.80,500)
on conflict do nothing;

-- NUEVA REGLA (decisión de la dueña, 21/10/2026): N = cosmetólogas MARCADAS, no "quien tenga tickets"
create table if not exists public.cosmetologas (
  id text primary key,                 -- uid del app (andrea, daniela…)
  nombre text not null,
  patron text not null,                -- ILIKE para empatar 'Atendido por' del ticket
  es_cosmetologa boolean not null default true,
  activa boolean not null default true,
  desde date, hasta date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
insert into public.cosmetologas (id,nombre,patron,es_cosmetologa,activa,desde,hasta) values
 ('andrea','Andrea Robles','andrea%',true,true,null,null),
 ('daniela','Daniela Mora','daniela%',true,true,null,null),
 ('dejaneira','Dejaneira Espinoza','dejaneira%',true,false,null,'2026-09-25'),
 ('alejandra','Alejandra Rodriguez','alejandra%',false,true,null,null)
on conflict do nothing;
alter table public.cosmetologas enable row level security;

-- Override manual de N por ciclo (si se quiere forzar otro divisor)
create table if not exists public.ciclo_override (
  ciclo date primary key check (extract(day from ciclo) = 26),
  n_cosmetologas int not null check (n_cosmetologas > 0),
  motivo text, creado_por text, created_at timestamptz not null default now());
alter table public.ciclo_override enable row level security;
alter table public.config_comisiones enable row level security;
alter table public.niveles_paquetes enable row level security;

-- Tickets normalizados (fuente: tabla espejo tickets)
create or replace view public.v_tickets as
select t.id, t.sheet_row, ts_local(t."timestamp") as ts, ts_local(t."timestamp")::date as fecha,
  ciclo_inicio(ts_local(t."timestamp")::date) as ciclo,
  trim(t.atendido_por) as cosm, split_part(coalesce(t.id_3,''),'.',1) as cedula,
  t.nombre, t.apellido, t.estimado,
  substring(t.facial_hecho from 'SUNSU-\d+') as facial_sku,
  (coalesce(trim(t.compra_pack_3),'') not in ('','false','FALSE'))::int
   + 2*(coalesce(trim(t.compra_pack_6),'') not in ('','false','FALSE'))::int as paquetes_raw,
  coalesce(t.excluir_facial,false) excl_facial, coalesce(t.excluir_paquete,false) excl_paquete,
  coalesce(t.excluir_producto,false) excl_producto, coalesce(t.excluir_extras,false) excl_extras,
  t.servicios_adicionales as extras_txt
from public.tickets t
where t."timestamp" is not null and coalesce(trim(t.atendido_por),'') <> '' and upper(trim(t.atendido_por)) <> 'SUNSU'
  and split_part(coalesce(t.id_3,''),'.',1) <> (select cedula_interna from public.config_comisiones);

-- Resumen por ciclo: clientas (tickets con facial SUNSU-n), N marcado/override y N viejo (bug)
create or replace view public.v_ciclo_resumen as
with c as (
  select ciclo, count(*) filter (where facial_sku is not null) as total_clientas,
         count(distinct cosm) as n_con_tickets_regla_vieja
  from public.v_tickets group by ciclo)
select c.ciclo, (c.ciclo + interval '1 month' - interval '1 day')::date as ciclo_fin,
  c.total_clientas, c.n_con_tickets_regla_vieja,
  coalesce(o.n_cosmetologas, (select count(*) from public.cosmetologas k where k.es_cosmetologa
      and (k.desde is null or k.desde <= (c.ciclo + interval '1 month' - interval '1 day')::date)
      and (k.hasta is null or k.hasta >= c.ciclo)
      and (k.activa or k.hasta is not null))) as n_cosmetologas,
  o.n_cosmetologas is not null as n_override,
  c.total_clientas >= (select min_clientas_bono from public.config_comisiones) as bono_activo
from c left join public.ciclo_override o on o.ciclo = c.ciclo;

-- Metas por nivel y ciclo (regla nueva) + comparación con la regla vieja
create or replace view public.v_metas_ciclo as
select r.ciclo, n.nivel, n.pct, n.premio, r.total_clientas, r.n_cosmetologas,
  ceil(r.total_clientas * n.pct / nullif(r.n_cosmetologas,0))::int as meta_paquetes,
  ceil(r.total_clientas * n.pct / nullif(r.n_con_tickets_regla_vieja,0))::int as meta_regla_vieja
from public.v_ciclo_resumen r cross join public.niveles_paquetes n;

-- Comisiones por cosmetóloga y ciclo (faciales, extras, paquetes con nivel)
create or replace view public.v_comisiones_ciclo as
with cfg as (select * from public.config_comisiones),
base as (
  select v.ciclo, v.cosm,
    count(*) filter (where v.facial_sku is not null and not v.excl_facial
        and (v.facial_sku = any(cfg.faciales_2) or v.facial_sku = any(cfg.faciales_3))) as faciales,
    sum(case when v.excl_facial or v.facial_sku is null then 0
             when v.facial_sku = any(cfg.faciales_2) then cfg.com_facial_2
             when v.facial_sku = any(cfg.faciales_3) then cfg.com_facial_3 else 0 end) as com_faciales,
    sum(case when v.excl_paquete then 0 else v.paquetes_raw end) as paquetes,
    sum(case when v.excl_extras or coalesce(v.extras_txt,'')='' then 0 else
      (select count(*) from unnest(string_to_array(v.extras_txt,'|')) p
        where trim(p) <> '' and upper(p) not like '%CORTES%') end) as extras
  from public.v_tickets v cross join cfg group by v.ciclo, v.cosm)
select b.*, b.extras * (select com_extra from cfg) as com_extras,
  k.id as cosmetologa_id, coalesce(k.es_cosmetologa,false) as es_cosmetologa,
  r.total_clientas, r.n_cosmetologas, r.bono_activo,
  lv.nivel as nivel_alcanzado,
  case when r.bono_activo and k.es_cosmetologa then coalesce(lv.premio,0) else 0 end as com_paquetes
from base b
left join public.cosmetologas k on b.cosm ilike k.patron
join public.v_ciclo_resumen r on r.ciclo = b.ciclo
left join lateral (select m.nivel, m.premio from public.v_metas_ciclo m
   where m.ciclo = b.ciclo and b.paquetes >= m.meta_paquetes order by m.nivel desc limit 1) lv on true;

-- RPC: metas de un ciclo (fecha cualquiera dentro del ciclo; default hoy Ecuador)
create or replace function public.metas_ciclo(p_fecha date default (now() at time zone 'America/Guayaquil')::date)
returns setof public.v_metas_ciclo language sql stable as $$
  select * from public.v_metas_ciclo where ciclo = public.ciclo_inicio(p_fecha) order by nivel $$;

-- ── COTIZACIONES: numeración COT-0001 atómica (reemplaza LockService) ──
create sequence if not exists public.cot_seq start 1;
create table if not exists public.cotizaciones (
  id bigserial primary key,
  numero text not null unique default ('COT-' || lpad(nextval('public.cot_seq')::text, 4, '0')),
  fecha timestamptz not null default now(), creado_por text, cliente text not null check (length(trim(cliente))>0),
  telefono text, email text, cedula text, items jsonb not null check (jsonb_array_length(items) > 0),
  subtotal numeric not null, descuento numeric not null default 0, iva numeric not null, total numeric not null check (total >= 0),
  validez text default 'Válida por 15 días', notas text, estado text not null default 'Enviada',
  orig jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.cotizaciones enable row level security;
