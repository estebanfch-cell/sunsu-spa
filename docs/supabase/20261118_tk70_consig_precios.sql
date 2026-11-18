-- TK70 (Emilia 2026-11-18): precio de consignación por proveedor-producto, distinto del
-- costo_promedio / «Compra real» de la ficha. La liquidación de Compras › Consignación usa
-- este precio (el de la última OC enviada, p. ej. OC-2026-087). Aditivo: tabla nueva,
-- siembra desde ordenes_compra (no pisa filas manuales) y se agrega a app_beta_write.
begin;

create table if not exists public.beta_consig_precios (
  id uuid primary key default gen_random_uuid(),
  familia text not null,
  sku text not null,
  producto_id uuid,
  proveedor_id uuid,
  precio numeric(14,8) not null check (precio >= 0),
  fuente text not null default 'oc' check (fuente in ('oc', 'manual')),
  oc_numero text,
  actualizado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (familia, sku)
);
comment on table public.beta_consig_precios is 'Precio de compra de consignación (sin IVA) por familia+SKU. Editable por admin; por defecto, la última OC enviada.';
alter table public.beta_consig_precios enable row level security;

-- Siembra / actualiza desde la última OC del sistema viejo (ordenes_compra.json),
-- sin pisar un precio que el admin haya guardado a mano.
with oc as (
  select numorden, coalesce(json::jsonb, '{}'::jsonb) as j
  from public.ordenes_compra
  where json is not null and btrim(json::text) <> '' and btrim(json::text) <> 'null'
),
lineas as (
  select o.numorden,
         upper(btrim(coalesce(o.j #>> '{prov,familia}', ''))) as familia,
         upper(regexp_replace(btrim(coalesce(x.elem->>'sku','')), '^SUNSU-', '')) as sku,
         nullif(x.elem->>'compra', '')::numeric as precio,
         x.ord
  from oc o
  cross join lateral (
    select elem, 1 as ord from jsonb_array_elements(coalesce(o.j->'fact', '[]'::jsonb)) as elem
    union all
    select elem, 2 as ord from jsonb_array_elements(coalesce(o.j->'items', '[]'::jsonb)) as elem
    union all
    select elem, 3 as ord from jsonb_array_elements(coalesce(o.j->'directa', '[]'::jsonb)) as elem
  ) x
),
ult as (
  select distinct on (familia, sku)
    familia, sku, precio, numorden
  from lineas
  where familia ~ '^[A-Z]{2,3}$'
    and sku ~ '^[A-Z]{2,3}-[0-9]+$'
    and precio is not null and precio > 0
  order by familia, sku, numorden desc, ord asc
)
insert into public.beta_consig_precios (familia, sku, producto_id, proveedor_id, precio, fuente, oc_numero, actualizado_por)
select u.familia,
       u.sku,
       p.id,
       pr.id,
       u.precio,
       'oc',
       u.numorden,
       'Grok Bot'
from ult u
left join public.erp_productos p on upper(regexp_replace(btrim(p.sku), '^SUNSU-', '')) = u.sku
left join lateral (
  select id from public.erp_proveedores ep
  where ep.activo is not false and (
    (u.familia = 'ML' and ep.nombre ilike '%Atencio%')
    or (u.familia = 'HT' and ep.nombre ilike '%Hebetronic%')
    or (u.familia = 'AS' and ep.nombre ilike '%Allskin%')
    or (u.familia = 'PH' and ep.nombre ilike '%APHLORA%')
    or (u.familia = 'JN' and ep.nombre ilike '%Ayala%')
    or (u.familia = 'VK' and ep.nombre ilike '%Moya%')
  )
  order by ep.nombre
  limit 1
) pr on true
on conflict (familia, sku) do update
  set precio = excluded.precio,
      producto_id = coalesce(excluded.producto_id, public.beta_consig_precios.producto_id),
      proveedor_id = coalesce(excluded.proveedor_id, public.beta_consig_precios.proveedor_id),
      oc_numero = excluded.oc_numero,
      actualizado_por = excluded.actualizado_por,
      updated_at = now()
  where public.beta_consig_precios.fuente is distinct from 'manual';

-- app_beta_write: lista vigente en vivo (2026-11-18) + beta_consig_precios.
CREATE OR REPLACE FUNCTION public.app_beta_write(p_actor text, p_table text, p_op text, p_match jsonb, p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  allowed text[] := array['beta_conteos','beta_conteo_lineas','beta_notificaciones','beta_transferencias','beta_transferencia_lineas','beta_ajustes','beta_ajuste_lineas','beta_stock','beta_stock_movimientos','beta_tickets','beta_ticket_lineas','beta_clientes','beta_cliente_notas',
    'beta_acuity_calendars','beta_citas_ticket','beta_ticket_envios','beta_ventas','beta_venta_lineas','beta_pagos','beta_caja_movimientos','beta_caja_cierres',
    'beta_paquetes','beta_paquete_usos','beta_gift_cards','beta_gift_movimientos','beta_permisos_usuario','beta_ticket_flags','beta_ticket_cancelados','beta_aperturas','beta_paquete_ajustes','beta_multa_tipos','beta_multas','beta_cliente_documentos','beta_credenciales','beta_gift_ajustes','beta_gift_documentos','beta_cliente_alias','beta_oc_cotizaciones','beta_consig_restock','beta_proveedores_ficha','beta_actas','beta_migo_facturas_vivo','beta_migo_importes','beta_cuadre_link','beta_migo_borradores',
    'beta_rol_publicaciones','beta_consig_precios'];
  col text; cols text[] := array[]::text[]; exprs text[] := array[]::text[];
  sets text[] := array[]::text[]; wh text[] := array[]::text[]; rec jsonb; q text;
begin
  if coalesce(btrim(p_actor), '') = '' then raise exception 'actor requerido'; end if;
  if p_table in ('beta_stock_movimientos','beta_pagos','beta_caja_movimientos','beta_caja_cierres','beta_paquete_usos','beta_gift_movimientos') and p_op = 'delete' then
    raise exception 'Los movimientos no se borran (se anulan con otro movimiento)';
  end if;
  if not (p_table = any (allowed)) then raise exception 'tabla no permitida: %', p_table; end if;
  if p_op not in ('insert','update','delete') then raise exception 'op invalida'; end if;
  perform set_config('app.user', p_actor, true);
  if p_op = 'insert' then
    for col in select jsonb_object_keys(coalesce(p_row, '{}'::jsonb)) loop
      if col !~ '^[a-z_][a-z0-9_]*$' then raise exception 'columna invalida: %', col; end if;
      if (p_row -> col) = 'null'::jsonb then continue; end if;
      if not exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=p_table and c.column_name=col) then continue; end if;
      cols := cols || quote_ident(col);
      exprs := exprs || format('(jsonb_populate_record(null::public.%I, $1)).%I', p_table, col);
    end loop;
    if coalesce(array_length(cols, 1), 0) = 0 then raise exception 'insert vacio'; end if;
    q := format('insert into public.%I (%s) select %s returning to_jsonb(public.%I.*)', p_table, array_to_string(cols, ','), array_to_string(exprs, ','), p_table);
    execute q using p_row into rec;
    return rec;
  end if;
  if p_match is null or p_match = '{}'::jsonb then raise exception 'update/delete sin filtro'; end if;
  for col in select jsonb_object_keys(p_match) loop
    if col !~ '^[a-z_][a-z0-9_]*$' then raise exception 'columna invalida: %', col; end if;
    wh := wh || format('%I is not distinct from (jsonb_populate_record(null::public.%I, $2)).%I', col, p_table, col);
  end loop;
  if p_op = 'delete' then
    q := format('delete from public.%I where %s returning to_jsonb(public.%I.*)', p_table, array_to_string(wh, ' and '), p_table);
    execute q using null::jsonb, p_match into rec;
    return rec;
  end if;
  for col in select jsonb_object_keys(coalesce(p_row, '{}'::jsonb)) loop
    if col !~ '^[a-z_][a-z0-9_]*$' then raise exception 'columna invalida: %', col; end if;
    if col in ('id') then continue; end if;
    if not exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=p_table and c.column_name=col) then continue; end if;
    sets := sets || format('%I = (jsonb_populate_record(null::public.%I, $1)).%I', col, p_table, col);
  end loop;
  if coalesce(array_length(sets, 1), 0) = 0 then raise exception 'update vacio'; end if;
  q := format('update public.%I set %s where %s returning to_jsonb(public.%I.*)', p_table, array_to_string(sets, ','), array_to_string(wh, ' and '), p_table);
  execute q using p_row, p_match into rec;
  return rec;
end
$function$;

revoke all on function public.app_beta_write(text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.app_beta_write(text, text, text, jsonb, jsonb) to service_role;

commit;

select familia, sku, round(precio, 4) as precio, fuente, oc_numero
from public.beta_consig_precios
order by familia, sku;
