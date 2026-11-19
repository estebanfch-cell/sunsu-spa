-- TK121 (Daniela 19/11 11:24): canje de paquete con «Comisión estimada» $0.
-- Solo líneas faciales de canje en $0 (las que mostraban $0). Las nuevas las congela el API al guardar.
-- Congela en la línea (columna comision de TK114) la tarifa fija del facial hecho, también en canjes $0.
-- Solo datos: sin cambios de esquema. Respaldo primero. Idempotente (solo toca comision 0/null).
-- Regla: misma de Comisiones / sistema viejo: SUNSU-01..06 = $2, 40/41/42/43/52/57 = $3 (sin reglas por facial en app_kv),
-- cero si la línea o el ticket excluyen comisión o la cosmetóloga no cobra faciales (aprendiz).
begin;
create table if not exists public.tk121_lineas_facial_bak_20261119 as
select l.* from public.beta_ticket_lineas l where false;

with obj as (
  select l.id,
    case when regexp_replace(l.sku,'\D','','g')::text in ('1','01','2','02','3','03','4','04','5','05','6','06') then 2
         when regexp_replace(l.sku,'\D','','g') in ('40','41','42','43','52','57') then 3 else 0 end * greatest(1, round(coalesce(l.cantidad,1)))::numeric as com
  from public.beta_ticket_lineas l
  join public.beta_tickets b on b.clave = l.ticket_clave
  join public.tickets t on coalesce(t.so_num,'') = l.ticket_clave or coalesce(t.beta_num,'') = l.ticket_clave
  where l.tipo = 'facial' and coalesce(l.precio_unit,0) = 0 and coalesce(l.total_linea,0) = 0 and t.timestamp >= '2026-11-01' and t.borrado_at is null
    and coalesce(l.excluir_comision,false) = false and coalesce(b.excluir_cosmetologa,false) = false
    and coalesce(l.comision,0) = 0
    and not exists (select 1 from public.cosmetologas c where c.comision_faciales = false
                    and lower(split_part(t.atendido_por,' ',1)) = lower(split_part(c.nombre,' ',1)))
)
insert into public.tk121_lineas_facial_bak_20261119
select l.* from public.beta_ticket_lineas l join obj on obj.id = l.id where obj.com > 0
  and not exists (select 1 from public.tk121_lineas_facial_bak_20261119 k where k.id = l.id);

update public.beta_ticket_lineas l
set comision = case when regexp_replace(l.sku,'\D','','g') in ('1','01','2','02','3','03','4','04','5','05','6','06') then 2 else 3 end
               * greatest(1, round(coalesce(l.cantidad,1)))::numeric
from public.tk121_lineas_facial_bak_20261119 k
where k.id = l.id and coalesce(l.comision,0) = 0;
commit;
