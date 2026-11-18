-- 20261118_migo_factura_tickets.sql
-- Una factura de Migo puede cubrirse con varios tickets. El vínculo ticket↔factura
-- ya vive en beta_cuadre_link (un ticket, una factura; la misma factura en varias filas).
-- Aditivo: índice por factura (si faltara) y lista de tickets en el borrador.
-- No toca Sheets ni columnas fac/fac_7 de tickets. Sin cédulas ni teléfonos.

create index if not exists beta_cuadre_link_factura_idx on public.beta_cuadre_link (factura);

alter table public.beta_migo_borradores
  add column if not exists tickets_vinculados text[] not null default '{}';

comment on column public.beta_migo_borradores.tickets_vinculados is
  'Claves de los tickets vinculados a esta factura (uno o varios). El detalle de cuadre está en beta_cuadre_link.';
