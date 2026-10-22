-- 0014_asistencia_v2.sql — incremental e idempotente. Reloj propio sin Jibble.
--   Permisos/vacaciones con resolución (quién, cuándo, motivo), marca manual de admin,
--   y marcas/auditoría que no se borran.

alter table public.permisos add column if not exists dias numeric;
alter table public.permisos add column if not exists resuelto_por text;
alter table public.permisos add column if not exists resuelto_ts timestamptz;
alter table public.permisos add column if not exists motivo_resolucion text;

alter table public.asistencia_marcajes add column if not exists creado_por text;
alter table public.asistencia_marcajes add column if not exists motivo_manual text;
alter table public.asistencia_marcajes drop constraint if exists asistencia_marcajes_origen_check;
alter table public.asistencia_marcajes add constraint asistencia_marcajes_origen_check
  check (origen in ('telefono','recepcion','manual'));
alter table public.asistencia_marcajes drop constraint if exists asistencia_marcajes_manual_motivo;
alter table public.asistencia_marcajes add constraint asistencia_marcajes_manual_motivo
  check (origen <> 'manual' or coalesce(btrim(motivo_manual),'') <> '');

-- Una marca no se borra: se anula con motivo. La auditoría es solo de escritura.
create or replace function public.asis_no_borrar() returns trigger language plpgsql as $$
begin
  if current_setting('app.asis_purga', true) = 'si' then return old; end if;
  raise exception 'En asistencia no se borra: se anula con motivo';
end $$;
drop trigger if exists trg_asis_marcajes_no_borrar on public.asistencia_marcajes;
create trigger trg_asis_marcajes_no_borrar before delete on public.asistencia_marcajes
  for each row execute function public.asis_no_borrar();
drop trigger if exists trg_asis_aud_no_tocar on public.asistencia_auditoria;
create trigger trg_asis_aud_no_tocar before update or delete on public.asistencia_auditoria
  for each row execute function public.asis_no_borrar();

-- Anular exige motivo.
alter table public.asistencia_marcajes drop constraint if exists asistencia_marcajes_anula_motivo;
alter table public.asistencia_marcajes add constraint asistencia_marcajes_anula_motivo
  check (not anulado or coalesce(btrim(motivo_anulacion),'') <> '') not valid;

create index if not exists permisos_empleada_idx on public.permisos (empleada);
