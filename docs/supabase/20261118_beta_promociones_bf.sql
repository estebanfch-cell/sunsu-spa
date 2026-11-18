-- 18/11 Black Friday (aprobado por Emilia 06:49): una promo beta puede reclamar VARIAS filas de la hoja
-- (🎉 PROMOS filas con el mismo GRUPO). Aditivo: solo agrega la columna y la fila de la promo.
alter table public.beta_promociones add column if not exists sheet_filas int[];

insert into public.beta_promociones (id, nombre, desde, hasta, activa, reglas, notas, origen, sheet_row, sheet_filas, creado_por, historial, created_at, updated_at)
select gen_random_uuid(), 'Black Friday', date '2026-11-17', date '2026-12-15', true,
  '[{"tipo":"pct","alcance":"codigos","codigos":["53"],"valor":10,"valor2":0,"min":1,"etiqueta":"Ginseng x3 · 10% adicional"},
    {"tipo":"pct","alcance":"codigos","codigos":["54"],"valor":10,"valor2":0,"min":1,"etiqueta":"Ginseng x6 · 10% adicional"},
    {"tipo":"monto","alcance":"codigos","codigos":["ML-001","ML-013"],"valor":10,"valor2":0,"min":2,"por":"unidad","etiqueta":"ML-001 + ML-013 · lleva 2: −$10 c/u"}]'::jsonb,
  'Reglas de Emilia 18/11: ML-001/ML-013 −$10 c/u si lleva 2+ (combinables); Ginseng x3 y x6 10% adicional sobre el precio del paquete.',
  'sheet', 5, array[5,6,7,8], 'Grok Bot (pedido de Emilia)',
  jsonb_build_array(jsonb_build_object('fecha', now(), 'actor', 'Grok Bot', 'accion', 'creada con las reglas de Black Friday (filas 5-8 de la hoja)')), now(), now()
where not exists (select 1 from public.beta_promociones where lower(nombre) = 'black friday');
