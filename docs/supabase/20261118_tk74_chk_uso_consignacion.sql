-- TK74 (18/11/2026): la bodega CONSIGNACION acepta productos de cualquier uso, igual que usoCompatible() en erp.ts.
-- Sin esto, recibir un restock de consignación (RST) fallaba en producción con
-- «Producto de uso venta no puede ir a bodega consignacion».
-- Antes: if t in ('casa', 'ubicacion') then return new;
CREATE OR REPLACE FUNCTION public.erp_chk_uso()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare u text; t text;
begin
  select uso into u from public.erp_productos where id = new.producto_id;
  select tipo into t from public.erp_bodegas where id = new.bodega_id;
  if u is null or t is null then return new; end if;
  if t in ('casa', 'ubicacion', 'consignacion') then return new; end if;
  if u = 'ambos' and t in ('cabina', 'venta') then return new; end if;
  if u <> t then
    raise exception 'Producto de uso % no puede ir a bodega %', u, t;
  end if;
  return new;
end $function$;
