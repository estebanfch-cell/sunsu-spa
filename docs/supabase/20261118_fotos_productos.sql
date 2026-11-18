-- Fotos de productos (Emilia t495u, 18/11). Solo beta, sin hojas. Aditivo.
-- 1) Respaldo de foto_url/foto_thumb de los 50 productos tocados (48 sin foto + BV-002/BV-003 con foto en Drive).
create table if not exists public.beta_productos_backup_20261118_fotos as
  select id, sku, foto_url, foto_thumb, now() as respaldado_at from public.erp_productos
  where sku in (select jsonb_array_elements_text('["AS-003", "AS-004", "AS-005", "AS-006", "AS-007", "AS-009", "AS-010", "BV-002", "BV-003", "INV-003", "INV-005", "INV-010", "INV-014", "INV-028", "INV-032", "INV-033", "INV-038", "INV-040", "INV-050", "INV-051", "INV-052", "INV-053", "INV-059", "INV-060", "INV-062", "INV-075", "INV-077", "JN-001", "JN-003", "JN-005", "JN-008", "JN-009", "ML-001", "ML-002", "ML-005", "ML-007", "ML-010", "ML-011", "PH-003", "PH-004", "PH-005", "PH-007", "PH-008", "SU-002", "SU-008", "SU-009", "VK-011", "VK-012", "VK-016", "VK-017"]'::jsonb));
alter table public.beta_productos_backup_20261118_fotos enable row level security;
-- 2) Por producto (aplicado con un script, la imagen va en base64, no se guarda aquí):
--   insert into app_archivos (id, kind='foto-producto', nombre, mime='image/jpeg', data_b64, created_by='grok-bot')
--   update erp_productos set foto_url='archivo:<id>', foto_thumb='data:image/jpeg;base64,...'
--     where sku=<sku> and coalesce(foto_url,'')=''   (BV-002/BV-003: where foto_url like 'https://lh3.googleusercontent.com/%')
--   Lista sku → archivo → fuente: docs/backups/fotos_productos_20261118.json
-- Reversible: update erp_productos e set foto_url=b.foto_url, foto_thumb=b.foto_thumb from beta_productos_backup_20261118_fotos b where b.id=e.id;
