-- TK36 (Emilia 18/11 08:47): vaciar el contenido (pasos / líneas de producto) de todos los protocolos beta.
-- Se conserva la lista de faciales (filas de beta_protocolos: id, sku, nombre, mano de obra, notas).
-- 1) Respaldo completo en una tabla aparte (aditiva) + JSON en docs/backups/beta_protocolos_20261118.json.
-- 2) Vacía pasos (versión +1; el trigger de auditoría guarda el antes/después en audit_log).
-- No toca cabina_protocolos ni cabina_protocolo_pasos (vienen de la hoja).
-- Para deshacer (restaura los pasos tal cual estaban):
--   update public.beta_protocolos t set pasos = b.pasos, version = t.version + 1, updated_at = now(),
--     actualizado_por = 'restaurado TK36' from public.beta_protocolos_backup_20261118 b where b.id = t.id;
begin;
create table if not exists public.beta_protocolos_backup_20261118 as
  select p.*, now() as respaldado_at from public.beta_protocolos p;
alter table public.beta_protocolos_backup_20261118 enable row level security;
select set_config('app.user', 'TK36 · vaciado a pedido de Emilia', true);
update public.beta_protocolos
   set pasos = '[]'::jsonb, version = version + 1, updated_at = now(), actualizado_por = 'TK36 · vaciado a pedido de Emilia'
 where borrado_at is null and coalesce(jsonb_array_length(pasos), 0) > 0
   and exists (select 1 from public.beta_protocolos_backup_20261118 b where b.id = beta_protocolos.id and b.pasos = beta_protocolos.pasos);
commit;
