-- 20261119_tk135_cuadre_facturas.sql
-- Aditivo: backup primero. Permite guardar todas las facturas de un ticket (varios-a-1)
-- cuando el cruce del mismo día une más de una factura. No toca tickets, Sheets ni Migo.
-- No guarda cédulas, teléfonos ni correos.

create table if not exists public.beta_cuadre_link_bak_20261119_tk135 as table public.beta_cuadre_link;

alter table public.beta_cuadre_link
  add column if not exists facturas jsonb not null default '[]'::jsonb;

comment on column public.beta_cuadre_link.facturas is
  'TK135: lista de facturas cuando un ticket cuadra con varias del mismo día. Vacío o [factura] si es 1 a 1.';
