-- TK132 (Emilia 19/11 13:25): datos de la clienta del RIDE de Migo (solo lectura de Migo) para prellenar el ticket.
-- Solo agrega columnas. Contacto privado: nunca se expone a anon/authenticated.
alter table public.beta_migo_facturas_vivo add column if not exists cliente_ruc text;
alter table public.beta_migo_facturas_vivo add column if not exists cliente_email text;
alter table public.beta_migo_facturas_vivo add column if not exists cliente_telefono text;
alter table public.beta_migo_facturas_vivo add column if not exists cliente_direccion text;
revoke select (cliente_ruc, cliente_email, cliente_telefono, cliente_direccion) on public.beta_migo_facturas_vivo from anon, authenticated;

-- Datos del RIDE (PDFs ya exportados, solo lectura de Migo) se cargan en esas columnas
-- y, si faltaba, la cédula en datos de los borradores. Respaldo:
--   public.tk132_vivo_cliente_bak_20261119
--   public.tk132_borradores_datos_bak_20261119
-- Idempotente: solo llena columnas/datos vacíos. El SQL de valores no se publica.
