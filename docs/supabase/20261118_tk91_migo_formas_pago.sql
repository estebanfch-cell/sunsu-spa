-- TK91 (Emilia 18/11): formas de pago de cada factura Migo (pago mixto), del reporte Cobros Realizados. Solo agrega columna.
alter table beta_migo_facturas_vivo add column if not exists formas_pago jsonb;
