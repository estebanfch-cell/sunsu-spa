-- TK27 (Emilia 2026-11-17 20:02): bodega CONSIGNACION aparte de Venta. Aditivo:
-- 1) el CHECK de erp_bodegas.tipo acepta 'consignacion' (mismos valores de antes + uno nuevo);
-- 2) se crea la bodega CONSIGNACION (id fijo) en el local Esquina. No mueve stock: el stock real
--    se pasa a mano desde «Conteo inicial consignación» (queda en erp_movimientos y beta_stock_movimientos).
begin;
alter table public.erp_bodegas drop constraint if exists erp_bodegas_tipo_check;
alter table public.erp_bodegas add constraint erp_bodegas_tipo_check
  check (tipo = any (array['cabina'::text, 'venta'::text, 'casa'::text, 'ubicacion'::text, 'consignacion'::text]));
insert into public.erp_bodegas (id, codigo, nombre, tipo, activo, local_id, orden)
values ('66666666-6666-4666-8666-666666666666', 'CONSIGNACION', 'Consignación', 'consignacion', true,
        '33333333-3333-4333-8333-333333333333', 5)
on conflict (codigo) do nothing;
commit;
select id, codigo, nombre, tipo from public.erp_bodegas where codigo = 'CONSIGNACION';
