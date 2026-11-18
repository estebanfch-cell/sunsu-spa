-- 0056: feriados 2026 que faltaban (suspensión 20 nov nacional + Fundación de Quito).
-- SOLO AGREGA columnas, respaldo y filas. No borra feriados existentes.
-- Fuentes oficiales:
-- * Decreto Ejecutivo 507 (R.O. Octavo Suplemento No. 380, 30 sep 2026):
--   suspende la jornada el viernes 20 de noviembre de 2026 en todo el país,
--   para público y privado, no recuperable (Festival de Artes Vivas de Loja).
--   No es feriado nacional permanente del calendario del Viceministerio de Turismo,
--   pero es descanso obligatorio ese día.
-- * Fundación de Quito: 6 de diciembre (domingo en 2026). El descanso laboral
--   del DMQ se traslada al lunes 7 (art. 65 C.T. / práctica oficial). Solo Quito.
-- El spa está en Cumbayá (DMQ), así que el traslado del 7 aplica.

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'asistencia_feriados_bak_20261118'
  ) then
    execute 'create table public.asistencia_feriados_bak_20261118 as table public.asistencia_feriados';
  end if;
end $$;

alter table public.asistencia_feriados add column if not exists ambito text not null default 'nacional';
alter table public.asistencia_feriados add column if not exists no_recuperable boolean not null default false;
comment on column public.asistencia_feriados.ambito is 'nacional o quito (u otra localidad). El spa está en el DMQ.';
comment on column public.asistencia_feriados.no_recuperable is 'Suspensión de jornada que no se recupera (p. ej. Decreto 507).';

create table if not exists public.asistencia_feriados_log (
  id bigserial primary key,
  fecha date not null,
  nombre text,
  ambito text,
  fuente text,
  accion text not null,
  por text,
  created_at timestamptz not null default now()
);
comment on table public.asistencia_feriados_log is 'Bitácora de altas/cambios de feriados. Sin datos de personas.';
alter table public.asistencia_feriados_log enable row level security;
grant select on public.asistencia_feriados_log to anon, authenticated, service_role;
grant insert, update, delete, references, trigger, truncate on public.asistencia_feriados_log to service_role;
drop policy if exists asistencia_feriados_log_select on public.asistencia_feriados_log;
create policy asistencia_feriados_log_select on public.asistencia_feriados_log
  for select to anon, authenticated, service_role using (true);

insert into public.asistencia_feriados (fecha, nombre, fuente, traslado_de, ambito, no_recuperable) values
  ('2026-11-20', 'Suspensión de jornada (Festival de Artes Vivas de Loja)',
    'Decreto Ejecutivo 507, R.O. 8vo Supl. 380 (30 sep 2026)', null, 'nacional', true),
  ('2026-12-06', 'Fundación de Quito',
    'Calendario cívico del DMQ (6 de diciembre)', null, 'quito', false),
  ('2026-12-07', 'Fundación de Quito (traslado)',
    'Traslado del 6 dic (domingo) al lunes 7; solo DMQ', '2026-12-06', 'quito', false)
on conflict (fecha) do update set
  nombre = excluded.nombre,
  fuente = coalesce(public.asistencia_feriados.fuente, excluded.fuente),
  traslado_de = coalesce(public.asistencia_feriados.traslado_de, excluded.traslado_de),
  ambito = excluded.ambito,
  no_recuperable = excluded.no_recuperable;

insert into public.asistencia_feriados_log (fecha, nombre, ambito, fuente, accion, por)
select fecha, nombre, ambito, fuente, 'alta-0056', 'sql-0056'
from public.asistencia_feriados
where fecha in (date '2026-11-20', date '2026-12-06', date '2026-12-07')
  and not exists (
    select 1 from public.asistencia_feriados_log l
    where l.fecha = public.asistencia_feriados.fecha and l.accion = 'alta-0056'
  );
