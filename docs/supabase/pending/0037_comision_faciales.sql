-- Comisión de faciales por persona. Aditiva: no borra columnas ni reordena las que ya salen.
-- 0035 y 0036 ya están usados en producción: este archivo es el siguiente libre.
-- No se aplica solo. El dueño lo corre después de aprobar:
--   supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0037_comision_faciales.sql
--
-- La vista parte de docs/supabase/0002_reglas.sql (única definición de v_comisiones_ciclo en el repo).
-- Si producción divergió (0035/0036), comparar antes con
--   select pg_get_viewdef('public.v_comisiones_ciclo'::regclass, true);
-- y conservar ese cuerpo: solo cambia el CASE de com_faciales.

alter table public.cosmetologas
  add column if not exists comision_faciales boolean not null default true,
  add column if not exists comision_faciales_desde date;

comment on column public.cosmetologas.comision_faciales is
  'false = los faciales de esta persona pagan $0. Paquetes, productos y extras no cambian. Default true.';
comment on column public.cosmetologas.comision_faciales_desde is
  'Si está puesta, un facial con fecha anterior paga $0. Al encender la comisión, evita el pago retroactivo.';

-- Mismas columnas y el mismo orden que la vista viva de 0002.
-- com_faciales queda en 0 si la marca está apagada o el ticket es anterior a comision_faciales_desde.
-- comision_faciales se agrega al final.
create or replace view public.v_comisiones_ciclo as
with cfg as (select * from public.config_comisiones),
base as (
  select v.ciclo, v.cosm,
    count(*) filter (where v.facial_sku is not null and not v.excl_facial
        and (v.facial_sku = any(cfg.faciales_2) or v.facial_sku = any(cfg.faciales_3))) as faciales,
    sum(case when v.excl_facial or v.facial_sku is null then 0
             when coalesce(k.comision_faciales, true) = false then 0
             when k.comision_faciales_desde is not null and v.fecha < k.comision_faciales_desde then 0
             when v.facial_sku = any(cfg.faciales_2) then cfg.com_facial_2
             when v.facial_sku = any(cfg.faciales_3) then cfg.com_facial_3 else 0 end) as com_faciales,
    sum(case when v.excl_paquete then 0 else v.paquetes_raw end) as paquetes,
    sum(case when v.excl_extras or coalesce(v.extras_txt,'')='' then 0 else
      (select count(*) from unnest(string_to_array(v.extras_txt,'|')) p
        where trim(p) <> '' and upper(p) not like '%CORTES%') end) as extras
  from public.v_tickets v
  cross join cfg
  left join lateral (
    select c.comision_faciales, c.comision_faciales_desde
    from public.cosmetologas c
    where v.cosm ilike c.patron
    order by length(c.patron) desc
    limit 1
  ) k on true
  group by v.ciclo, v.cosm)
select b.*, b.extras * (select com_extra from cfg) as com_extras,
  k.id as cosmetologa_id, coalesce(k.es_cosmetologa,false) as es_cosmetologa,
  r.total_clientas, r.n_cosmetologas, r.bono_activo,
  lv.nivel as nivel_alcanzado,
  case when r.bono_activo and k.es_cosmetologa then coalesce(lv.premio,0) else 0 end as com_paquetes,
  coalesce(k.comision_faciales, true) as comision_faciales
from base b
left join public.cosmetologas k on b.cosm ilike k.patron
join public.v_ciclo_resumen r on r.ciclo = b.ciclo
left join lateral (select m.nivel, m.premio from public.v_metas_ciclo m
   where m.ciclo = b.ciclo and b.paquetes >= m.meta_paquetes order by m.nivel desc limit 1) lv on true;

-- Evelyn (cosmetóloga aprendiz) es la primera con la comisión apagada.
-- Si todavía no tiene fila, no cambia nada: se apaga al crearla en la app.
update public.cosmetologas
   set comision_faciales = false,
       updated_at = now()
 where comision_faciales is distinct from false
   and (nombre ilike 'evelyn%' or id::text ilike 'evelyn%');
