-- 0060: primer ingreso con contraseña temporal (dashboard de acceso TK100).
-- SOLO AGREGA la columna debe_cambiar_pass. No toca hashes ni usuarios.
-- No recorta app_beta_write.

alter table public.beta_credenciales
  add column if not exists debe_cambiar_pass boolean not null default false;
comment on column public.beta_credenciales.debe_cambiar_pass is
  'Si es true, el siguiente ingreso con usuario y contraseña obliga a elegir una contraseña propia. Lo pone el admin al asignar una clave temporal; se apaga cuando la persona guarda la suya en Mi acceso.';
