-- APLICAR en el proyecto Supabase. No poner este archivo en supabase/migrations.
-- 0028: el borrado suave de permisos, multas y horarios vive en borrado_at / borrado_por.
-- El import horario pisa orig y las columnas de la hoja, y Traer de Jibble reescribe
-- el horario, pero ninguno de los dos manda estas columnas.
-- Una marca de asistencia no se borra: se anula. Feriados y pago_config se eliminan de verdad.

alter table public.permisos add column if not exists borrado_at timestamptz;
alter table public.permisos add column if not exists borrado_por text;
alter table public.multas_descuentos add column if not exists borrado_at timestamptz;
alter table public.multas_descuentos add column if not exists borrado_por text;
alter table public.horarios add column if not exists borrado_at timestamptz;
alter table public.horarios add column if not exists borrado_por text;
