-- COPIA de referencia. YA APLICADA en el proyecto Supabase.
-- No poner este archivo en supabase/migrations (se re-aplicaría).

-- 0005: decisiones de Emilia (21/10/2026). No destructivo: solo crea/añade.
-- (5) Cotizaciones por ROL (admin, admin_master, reception), no por nombre
create or replace function public.puede_cotizar(p_rol text) returns boolean language sql immutable as
$$ select coalesce(p_rol,'') in ('admin','admin_master','reception') $$;

-- Niveles de paquetes con vigencia por ciclo (opción C/D/E pendiente desde 2026-10-26)
create table if not exists public.niveles_config (
  vigente_desde date not null check (extract(day from vigente_desde)=26),
  nivel int not null, pct numeric not null check (pct>0 and pct<=1), premio numeric not null check (premio>=0),
  nota text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (vigente_desde, nivel));
alter table public.niveles_config enable row level security;
insert into public.niveles_config (vigente_desde,nivel,pct,premio,nota)
select '2000-01-26', nivel, pct, premio, 'tabla histórica (CONFIG.NIVELES)' from public.niveles_paquetes on conflict do nothing;
comment on table public.niveles_config is 'Tabla de niveles vigente por ciclo. Para aplicar la opción elegida (C/D/E) desde el ciclo 2026-10-26: insertar filas con vigente_desde=2026-10-26 vía set_niveles().';
create or replace function public.niveles_de(p_ciclo date) returns table(nivel int, pct numeric, premio numeric) language sql stable as $$
  select n.nivel, n.pct, n.premio from public.niveles_config n
  where n.vigente_desde = (select max(vigente_desde) from public.niveles_config where vigente_desde <= p_ciclo) $$;
create or replace function public.set_niveles(p_desde date, p_niveles jsonb, p_nota text default null) returns int
language plpgsql as $$ declare k int; begin
  delete from public.niveles_config where vigente_desde = p_desde;
  insert into public.niveles_config(vigente_desde,nivel,pct,premio,nota)
  select p_desde, (e->>'nivel')::int, (e->>'pct')::numeric, (e->>'premio')::numeric, p_nota from jsonb_array_elements(p_niveles) e;
  get diagnostics k = row_count; return k; end $$;

-- Metas usando niveles vigentes del ciclo (mismas columnas que antes)
create or replace view public.v_metas_ciclo as
select r.ciclo, n.nivel, n.pct, n.premio, r.total_clientas, r.n_cosmetologas,
  ceil(r.total_clientas * n.pct / nullif(r.n_cosmetologas,0))::int as meta_paquetes,
  ceil(r.total_clientas * n.pct / nullif(r.n_con_tickets_regla_vieja,0))::int as meta_regla_vieja
from public.v_ciclo_resumen r cross join lateral public.niveles_de(r.ciclo) n;

-- (1) Comisión de productos = 30% de (subtotal s/IVA − compra) × unidades
create or replace view public.v_ticket_productos as
select v.id as ticket_id, v.ciclo, v.cosm, v.excl_producto, k.key as codigo, (k.value#>>'{}')::numeric as qty,
  c.subtotal as venta, nullif(regexp_replace(c.precio_compra,'[^0-9.]','','g'),'')::numeric as compra
from public.v_tickets v join public.tickets t on t.id = v.id
cross join lateral jsonb_each(t.orig) k
left join public.catalogo c on upper(regexp_replace(c.sku,'^SUNSU-','')) = upper(regexp_replace(k.key,'^SUNSU-',''))
where k.key ~ '^(SUNSU-)?[A-Z]{2,3}-[0-9]{3}$' and jsonb_typeof(k.value)='number' and (k.value#>>'{}')::numeric > 0;

-- Recepción: $0.50 × tickets con facial en días que cumplen meta (≥10; lunes ≥5)
create or replace view public.v_recepcion_dia as
select v.ciclo, v.fecha, count(*) as clientas,
  case when extract(isodow from v.fecha)=1 then cfg.recep_min_lunes else cfg.recep_min end as umbral,
  case when count(*) >= case when extract(isodow from v.fecha)=1 then cfg.recep_min_lunes else cfg.recep_min end
       then round(count(*) * cfg.recep_com_por_clienta, 2) else 0 end as comision
from public.v_tickets v cross join public.config_comisiones cfg
where v.facial_sku is not null group by v.ciclo, v.fecha, cfg.recep_min, cfg.recep_min_lunes, cfg.recep_com_por_clienta;

-- Comisión completa por persona y ciclo (paquetes INCLUIDOS en el total — decisión 2)
create or replace view public.v_comisiones_total as
with prod as (select ciclo, cosm, round(sum(case when excl_producto or venta is null then 0
                 else (venta - coalesce(compra,0)) * qty * (select pct_com_producto from public.config_comisiones) end),2) as com_productos
              from public.v_ticket_productos group by ciclo, cosm),
mul as (select ciclo_inicio(ts_local(fecha)::date) as ciclo, lower(trim(cosmetologa)) as cosm_l,
          sum(monto) filter (where lower(trim(tipo))='multa') as multas,
          sum(monto) filter (where lower(trim(tipo))='descuento') as descuentos
        from public.multas_descuentos where fecha is not null and monto > 0 group by 1,2),
rec as (select ciclo, sum(comision) as com_recepcion from public.v_recepcion_dia group by ciclo)
select c.ciclo, c.cosm, c.cosmetologa_id, c.es_cosmetologa, c.faciales, c.com_faciales, c.extras, c.com_extras,
  c.paquetes, c.nivel_alcanzado, c.com_paquetes, coalesce(p.com_productos,0) as com_productos,
  case when c.cosm ilike 'alejandra%' then coalesce(r.com_recepcion,0) else 0 end as com_recepcion,
  coalesce(m.multas,0) as multas, coalesce(m.descuentos,0) as descuentos,
  round(c.com_faciales + c.com_extras + c.com_paquetes + coalesce(p.com_productos,0)
    + case when c.cosm ilike 'alejandra%' then coalesce(r.com_recepcion,0) else 0 end
    - coalesce(m.multas,0) - coalesce(m.descuentos,0), 2) as total_neto
from public.v_comisiones_ciclo c
left join prod p on p.ciclo=c.ciclo and p.cosm=c.cosm
left join mul m on m.ciclo=c.ciclo and m.cosm_l=lower(c.cosm)
left join rec r on r.ciclo=c.ciclo;

-- Rol de pagos (reemplaza calcularRol): comisiones del ciclo 26→25 que cierra en p_mes,
-- productos con utilidad×30%, paquetes incluidos (2), vacaciones solo con ≥1 año (3).
create or replace function public.rol_calcular(p_nombre_app text, p_anio int, p_mes int,
  p_dias_laborados numeric default null, p_hrs_supl numeric default 0, p_hrs_extr numeric default 0, p_hrs_desc numeric default 0,
  p_anticipo numeric default 0, p_prest_hip numeric default 0, p_prest_quir numeric default 0, p_desc_sandalo numeric default 0)
returns jsonb language plpgsql stable as $$
declare e record; c record; dias_mes int; fin_mes date; sueldo numeric; costo_h numeric; sp numeric; ext numeric;
  com numeric; aport numeric; anios numeric; vac numeric; fr numeric; t13 numeric; t14 numeric; iess numeric; ing numeric; egr numeric; mult numeric;
begin
  select * into e from public.rrhh_empleadas where lower(nombre_app)=lower(p_nombre_app) limit 1;
  if e is null then return jsonb_build_object('error','Empleada no encontrada'); end if;
  fin_mes := (make_date(p_anio,p_mes,1) + interval '1 month - 1 day')::date; dias_mes := extract(day from fin_mes);
  sueldo := e.sueldo_base; costo_h := sueldo/240;
  sp := case when p_dias_laborados is not null and p_dias_laborados < dias_mes then round(sueldo/dias_mes*p_dias_laborados,2) else sueldo end;
  ext := round(p_hrs_supl*costo_h*1.5,2) + round((p_hrs_extr+p_hrs_desc)*costo_h*2.0,2);
  select * into c from public.v_comisiones_total where ciclo = make_date(p_anio,p_mes,26) - interval '1 month' and cosm ilike p_nombre_app||'%' limit 1;
  com := coalesce(c.com_faciales,0)+coalesce(c.com_extras,0)+coalesce(c.com_recepcion,0)+coalesce(c.com_productos,0)+coalesce(c.com_paquetes,0);
  mult := coalesce(c.multas,0)+coalesce(c.descuentos,0);
  aport := sp + e.bono_fijo + com + ext;
  anios := extract(epoch from (fin_mes::timestamp - ts_local(e.fecha_ingreso)))/(365.25*86400);
  t13 := round(aport/12,2); t14 := round(482.0/12,2);
  vac := case when anios >= 1 then round(sueldo/24,2) else 0 end;
  fr  := case when upper(coalesce(e.fondo_reserva,''))='SI' and anios >= 1 then round(sueldo/12,2) else 0 end;
  ing := sp + e.bono_fijo + com + ext + t13 + t14 + fr + vac;
  iess := round(aport*0.0945,2);
  egr := iess + p_anticipo + p_prest_hip + p_prest_quir + p_desc_sandalo + mult;
  return jsonb_build_object('empleada',e.nombre_app,'periodo',to_char(fin_mes,'YYYY-MM'),'anios_servicio',round(anios,2),
    'sueldo_proporcional',sp,'bono',e.bono_fijo,'horas_extra',ext,
    'com_faciales',coalesce(c.com_faciales,0),'com_extras',coalesce(c.com_extras,0),'com_recepcion',coalesce(c.com_recepcion,0),
    'com_productos',coalesce(c.com_productos,0),'com_paquetes',coalesce(c.com_paquetes,0),'nivel',c.nivel_alcanzado,'comisiones',com,
    'ingreso_aportable',aport,'decimo_tercero',t13,'decimo_cuarto',t14,'fondo_reserva',fr,'vacaciones',vac,
    'total_ingresos',round(ing,2),'iess_personal',iess,'multas_descuentos',mult,'total_egresos',round(egr,2),'total_recibir',round(ing-egr,2));
end $$;
