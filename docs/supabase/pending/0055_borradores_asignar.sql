-- 0055: backup y bitácora de asignación de borradores Migo abiertos a la cosmetóloga.
-- SOLO AGREGA: tabla de respaldo, tabla de log, y actualiza estado a «asignado»
-- cuando el borrador abierto YA tenía asignado_a. La asignación por cita de
-- Agenda/Acuity del mismo día la hace la API (migo_borradores_reasignar / el
-- import), que deja rastro en app_log y en esta tabla de log.
-- No toca Migo (sigue en solo lectura). No imprime ni guarda cédulas, teléfonos,
-- correos ni secretos.

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'beta_migo_borradores_bak_20261118'
  ) then
    execute 'create table public.beta_migo_borradores_bak_20261118 as table public.beta_migo_borradores';
  end if;
end $$;

create table if not exists public.beta_migo_borradores_asig_log (
  id bigserial primary key,
  factura text not null,
  fecha date,
  estado_antes text,
  asignado_a_antes text,
  estado_despues text,
  asignado_a_despues text,
  fuente text,
  por text,
  created_at timestamptz not null default now()
);
comment on table public.beta_migo_borradores_asig_log is
  'Bitácora de asignación de borradores Migo (factura + cosmetóloga). Sin datos de clientas.';
alter table public.beta_migo_borradores_asig_log enable row level security;
grant select on public.beta_migo_borradores_asig_log to anon, authenticated, service_role;
grant insert, update, delete, references, trigger, truncate on public.beta_migo_borradores_asig_log to service_role;
drop policy if exists beta_migo_borradores_asig_log_select on public.beta_migo_borradores_asig_log;
create policy beta_migo_borradores_asig_log_select on public.beta_migo_borradores_asig_log
  for select to anon, authenticated, service_role using (true);

-- Promueve a «asignado» los abiertos que ya tenían cosmetóloga en el propio borrador.
with cand as (
  select factura, fecha, estado, asignado_a
  from public.beta_migo_borradores
  where estado in ('pendiente', 'asignado', 'pendiente_aprobar', 'pendiente_por_aprobar')
    and coalesce(btrim(asignado_a), '') <> ''
    and ticket_id is null
    and coalesce(ticket_clave, '') = ''
    and estado is distinct from 'asignado'
),
upd as (
  update public.beta_migo_borradores b
  set estado = 'asignado',
      asignado_por = coalesce(nullif(btrim(b.asignado_por), ''), 'backfill-ya-asignado'),
      assigned_at = coalesce(b.assigned_at, now()),
      updated_at = now()
  from cand c
  where b.factura = c.factura
  returning b.factura, c.fecha, c.estado as estado_antes, c.asignado_a as asignado_a_antes,
            b.estado as estado_despues, b.asignado_a as asignado_a_despues
)
insert into public.beta_migo_borradores_asig_log (
  factura, fecha, estado_antes, asignado_a_antes, estado_despues, asignado_a_despues, fuente, por
)
select factura, fecha, estado_antes, asignado_a_antes, estado_despues, asignado_a_despues,
       'ya_asignado', 'sql-0055'
from upd;
