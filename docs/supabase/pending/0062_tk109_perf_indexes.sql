-- TK109: índices para listas/dashboard y gift cards en el menú del personal.
-- Aditivo. Backup previo: /workspace/backups/tk109/

create index if not exists tickets_timestamp_idx
  on public.tickets (timestamp desc);

create index if not exists tickets_activos_timestamp_idx
  on public.tickets (timestamp desc)
  where borrado_at is null;

create index if not exists tickets_atendido_timestamp_idx
  on public.tickets (atendido_por, timestamp desc)
  where borrado_at is null;

create index if not exists clientas_registro_nombre_idx
  on public.clientas_registro (nombre, apellido)
  where borrado_at is null;

insert into public.app_modulos (rol, modulo, acceso)
values
  ('cosmetologa', 'gift_cards', 'todos'),
  ('asistente_cosmetologia', 'gift_cards', 'todos')
on conflict (rol, modulo) do nothing;
