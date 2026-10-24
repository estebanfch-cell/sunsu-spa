-- APLICAR en el proyecto Supabase. No poner este archivo en supabase/migrations.
-- Borrado suave de la ficha de clienta. La fila queda. app_write ya permite clientas_registro.

alter table public.clientas_registro add column if not exists borrado_at timestamptz;
alter table public.clientas_registro add column if not exists borrado_por text;
