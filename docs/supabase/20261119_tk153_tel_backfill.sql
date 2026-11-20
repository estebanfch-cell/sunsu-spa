-- TK153: backfill aditivo de teléfonos vacíos en beta_clientes.
-- Backup primero. Nunca sobreescribe un teléfono ya usable (>= 7 dígitos).
-- El resultado del SELECT final son SOLO conteos (nunca números).

create table if not exists public._bak_20261119_tk153_tel_clientes as
select c.key, c.codigo, c.cedula, c.nombre, c.telefono as telefono_antes,
       c.datos as datos_antes, now() as bak_at
from public.beta_clientes c
where coalesce(c.borrado, false) is not true
  and length(regexp_replace(coalesce(c.telefono, c.datos->>'telefono', ''), '\D', '', 'g')) < 7;

with vacias as (
  select c.key,
    regexp_replace(coalesce(c.cedula, c.datos->>'cedula', ''), '\D', '', 'g') as ced,
    lower(trim(both from regexp_replace((coalesce(c.nombre, trim(both from coalesce(c.datos->>'nombres','') || ' ' || coalesce(c.datos->>'apellido','')), '')), '\s+', ' ', 'g'))) as nom
  from public.beta_clientes c
  where coalesce(c.borrado, false) is not true
    and length(regexp_replace(coalesce(c.telefono, c.datos->>'telefono', ''), '\D', '', 'g')) < 7
),
fuentes as (
  select 'antiguas'::text as fuente,
    regexp_replace(coalesce(cedula, ''), '\D', '', 'g') as ced,
    lower(trim(both from regexp_replace((coalesce(nombre, '')), '\s+', ' ', 'g'))) as nom,
    coalesce(nullif(telefono, ''), tel_acuity) as tel
  from public.clientas_antiguas
  union all
  select 'registro', regexp_replace(coalesce(cedula, ''), '\D', '', 'g'), '', telefono
  from public.clientas_registro
  union all
  select 'erp', regexp_replace(coalesce(cedula, ''), '\D', '', 'g'),
    lower(trim(both from regexp_replace((coalesce(nombre, '')), '\s+', ' ', 'g'))), telefono
  from public.erp_clientes
),
fuentes_ok as (
  select * from fuentes where length(regexp_replace(coalesce(tel, ''), '\D', '', 'g')) >= 7
),
por_ced as (
  select distinct on (ced) ced, tel, fuente
  from fuentes_ok
  where length(ced) >= 10
  order by ced, case fuente when 'antiguas' then 1 when 'registro' then 2 else 3 end
),
nom_unicos as (
  select nom from fuentes_ok where length(nom) >= 6 group by nom having count(distinct regexp_replace(coalesce(tel,''), '\D', '', 'g')) = 1
),
por_nom as (
  select distinct on (f.nom) f.nom, f.tel, f.fuente
  from fuentes_ok f
  join nom_unicos u on u.nom = f.nom
  order by f.nom
),
elegidos as (
  select v.key,
    coalesce(pc.tel, pn.tel) as tel,
    coalesce(pc.fuente, pn.fuente) as fuente
  from vacias v
  left join por_ced pc on pc.ced = v.ced and length(v.ced) >= 10
  left join por_nom pn on pn.nom = v.nom and (pc.tel is null)
  where coalesce(pc.tel, pn.tel) is not null
)
update public.beta_clientes c
set telefono = e.tel,
    datos = jsonb_set(coalesce(c.datos, '{}'::jsonb), '{telefono}', to_jsonb(e.tel), true)
from elegidos e
where c.key = e.key
  and length(regexp_replace(coalesce(c.telefono, c.datos->>'telefono', ''), '\D', '', 'g')) < 7;

select
  (select count(*) from public._bak_20261119_tk153_tel_clientes) as filas_en_backup,
  (select count(*) from public.beta_clientes c
    where coalesce(c.borrado, false) is not true
      and length(regexp_replace(coalesce(c.telefono, c.datos->>'telefono', ''), '\D', '', 'g')) >= 7) as con_tel_despues,
  (select count(*) from public.beta_clientes c
    where coalesce(c.borrado, false) is not true
      and length(regexp_replace(coalesce(c.telefono, c.datos->>'telefono', ''), '\D', '', 'g')) < 7) as siguen_vacias;
