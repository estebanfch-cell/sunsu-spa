-- TK114: congelar en la línea del ticket el precio de venta, la base de comisión
-- y el costo real de compra (utilidad). Aditivo. No se recorta app_beta_write.
-- Backup previo a cualquier dato: tablas *_bak_20261119_tk114.
-- El backfill solo llena filas SIN snapshot_at, con datos vigentes al momento del parche.

create table if not exists public.beta_ticket_lineas_bak_20261119_tk114 as
  table public.beta_ticket_lineas;

create table if not exists public.beta_tickets_bak_20261119_tk114 as
  table public.beta_tickets;

alter table public.beta_ticket_lineas
  add column if not exists venta_neta numeric,
  add column if not exists costo_real numeric,
  add column if not exists compra_comision numeric,
  add column if not exists comision numeric,
  add column if not exists utilidad numeric,
  add column if not exists falta_costo boolean,
  add column if not exists snapshot_at timestamptz;

comment on column public.beta_ticket_lineas.venta_neta is 'Subtotal sin IVA, con descuentos, congelado al vender.';
comment on column public.beta_ticket_lineas.costo_real is 'Costo real de compra (última OC / beta / inventario) × cantidad, congelado al vender. No es el precio de comisión.';
comment on column public.beta_ticket_lineas.compra_comision is 'Base de comisión × cantidad, congelada al vender.';
comment on column public.beta_ticket_lineas.utilidad is 'venta_neta − costo_real − comisión, congelada al vender. Null/0 si falta_costo.';

alter table public.beta_tickets
  add column if not exists neto_pack numeric,
  add column if not exists neto_pack6 numeric,
  add column if not exists precios_snapshot_at timestamptz;

comment on column public.beta_tickets.neto_pack is 'Neto sin IVA del paquete x3, congelado al vender.';
comment on column public.beta_tickets.neto_pack6 is 'Neto sin IVA del paquete x6, congelado al vender.';

create table if not exists public.beta_ticket_snaps (
  id text primary key,
  ticket_clave text not null,
  sku text not null,
  qty numeric not null default 0,
  venta_neta numeric,
  costo_real numeric,
  compra_comision numeric,
  comision numeric,
  utilidad numeric,
  falta_costo boolean not null default false,
  es_paquete boolean not null default false,
  snapshot_at timestamptz not null default now(),
  unique (ticket_clave, sku, es_paquete)
);
create index if not exists beta_ticket_snaps_clave on public.beta_ticket_snaps (ticket_clave);
alter table public.beta_ticket_snaps enable row level security;
comment on table public.beta_ticket_snaps is 'TK114: snapshot de precios para tickets de hoja sin líneas beta. No se pisa si ya existe.';

do $$
begin
  if exists (select 1 from pg_proc where proname = 'audit_trigger') then
    if not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = 'public.beta_ticket_snaps'::regclass) then
      execute 'create trigger trg_audit after insert or update or delete on public.beta_ticket_snaps for each row execute function public.audit_trigger(''id'')';
    end if;
  end if;
end $$;

-- Lista de 0059 más beta_ticket_snaps. No se quita ninguna.
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
    'beta_rol_publicaciones','beta_empleados','beta_iess_descuentos','beta_empleado_docs','beta_roles','beta_roles_log','beta_asistencia_horas_mes','beta_asistencia_horas_log','beta_ticket_snaps'];
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

-- Backfill de líneas beta: solo donde todavía no hay snapshot.
-- venta_neta reparte el total del ticket (ya con promo/descuento) según el peso de la línea.
-- costo_real: beta_compra_real, si no última OC (erp o hoja), si no inventario_base.compra.
-- Nunca se usa precio_compra, compra_comision ni costo_promedio como costo real.
do $$
begin
  if to_regclass('public.beta_ticket_lineas') is null then return; end if;

  update public.beta_ticket_lineas l
  set venta_neta = round((
      case
        when t.total is not null and t.total >= 0 and s.suma > 0
          then (coalesce(l.total_linea, 0) / s.suma) * t.total / 1.15
        else coalesce(l.total_linea, 0) / 1.15
      end
    )::numeric, 2)
  from public.beta_tickets t
  join (
    select ticket_clave, nullif(sum(coalesce(total_linea, 0)), 0) as suma
    from public.beta_ticket_lineas
    group by ticket_clave
  ) s on s.ticket_clave = t.clave
  where l.ticket_clave = t.clave
    and l.snapshot_at is null
    and l.venta_neta is null;

  create temporary table if not exists tk114_oc_erp (
    code text, precio numeric, fecha text
  ) on commit drop;
  if to_regclass('public.erp_oc_lineas') is not null and to_regclass('public.erp_oc') is not null and to_regclass('public.erp_productos') is not null then
    insert into tk114_oc_erp
    select distinct on (code) code, precio, fecha
    from (
      select replace(upper(p.sku), 'SUNSU-', '') as code,
             l.precio::numeric as precio,
             left(o.fecha::text, 10) as fecha
      from public.erp_oc_lineas l
      join public.erp_oc o on o.id = l.oc_id
      join public.erp_productos p on p.id = l.producto_id
      where coalesce(o.estado, '') not in ('anulada', 'cancelada', 'borrador', 'rechazada')
        and l.precio is not null and l.precio::numeric > 0
    ) z
    order by code, fecha desc;
  end if;

  create temporary table if not exists tk114_oc_hoja (
    code text, precio numeric, fecha text
  ) on commit drop;
  if to_regclass('public.ordenes_compra') is not null then
    insert into tk114_oc_hoja
    select distinct on (code) code, precio, fecha
    from (
      select
        replace(upper(coalesce(ln->>'sku', '')), 'SUNSU-', '') as code,
        coalesce(nullif(ln->>'compra', '')::numeric, nullif(ln->>'precio', '')::numeric, nullif(ln->>'costo', '')::numeric) as precio,
        case
          when o.fecha::text ~ '^\d{4}-' then left(o.fecha::text, 10)
          when o.fecha::text ~ '^\d{2}/\d{2}/\d{4}' then to_char(to_date(left(o.fecha::text, 10), 'DD/MM/YYYY'), 'YYYY-MM-DD')
          else left(o.fecha::text, 10)
        end as fecha
      from public.ordenes_compra o
      cross join lateral (
        select e as ln from jsonb_array_elements(coalesce((o.json)::jsonb->'fact', '[]'::jsonb)) e
        union all
        select e from jsonb_array_elements(coalesce((o.json)::jsonb->'items', '[]'::jsonb)) e
        union all
        select e from jsonb_array_elements(coalesce((o.json)::jsonb->'directa', '[]'::jsonb)) e
      ) x
      where o.json is not null
    ) z
    where code <> '' and precio is not null and precio > 0
    order by code, fecha desc, precio;
  end if;

  update public.beta_ticket_lineas l
  set
    compra_comision = case
      when l.tipo = 'producto' then round((coalesce(
        nullif(c.compra_comision::text, '')::numeric,
        nullif(c.precio_compra::text, '')::numeric,
        0
      ) * coalesce(l.cantidad, 0))::numeric, 2)
      else 0
    end,
    costo_real = case
      when l.tipo <> 'producto' then 0
      when coalesce(nullif(p.beta_compra_real::text, '')::numeric, 0) > 0
        then round((nullif(p.beta_compra_real::text, '')::numeric * coalesce(l.cantidad, 0))::numeric, 2)
      when coalesce(e.precio, h.precio) > 0
        then round((coalesce(e.precio, h.precio) * coalesce(l.cantidad, 0))::numeric, 2)
      when coalesce(nullif(ib.compra::text, '')::numeric, 0) > 0
        then round((nullif(ib.compra::text, '')::numeric * coalesce(l.cantidad, 0))::numeric, 2)
      else 0
    end
  from public.catalogo c
  left join public.erp_productos p on replace(upper(p.sku), 'SUNSU-', '') = replace(upper(c.sku), 'SUNSU-', '')
  left join tk114_oc_erp e on e.code = replace(upper(c.sku), 'SUNSU-', '')
  left join tk114_oc_hoja h on h.code = replace(upper(c.sku), 'SUNSU-', '')
  left join public.inventario_base ib on replace(upper(ib.sku), 'SUNSU-', '') = replace(upper(c.sku), 'SUNSU-', '')
  where replace(upper(c.sku), 'SUNSU-', '') = replace(upper(l.sku), 'SUNSU-', '')
    and l.snapshot_at is null;

  -- líneas de producto sin match de catálogo: no inventar costo
  update public.beta_ticket_lineas l
  set compra_comision = coalesce(l.compra_comision, 0),
      costo_real = coalesce(l.costo_real, 0)
  where l.snapshot_at is null
    and (l.compra_comision is null or l.costo_real is null);

  update public.beta_ticket_lineas l
  set
    comision = case
      when l.tipo = 'producto' and l.excluir_comision is not true
        then round((greatest(0, coalesce(l.venta_neta, 0) - coalesce(l.compra_comision, 0)) * 0.30)::numeric, 2)
      else 0
    end,
    falta_costo = (l.tipo = 'producto' and coalesce(l.costo_real, 0) <= 0 and coalesce(l.venta_neta, 0) > 0),
    utilidad = case
      when l.tipo = 'producto' and coalesce(l.costo_real, 0) > 0
        then round((coalesce(l.venta_neta, 0) - l.costo_real - case
          when l.excluir_comision is not true
            then round((greatest(0, coalesce(l.venta_neta, 0) - coalesce(l.compra_comision, 0)) * 0.30)::numeric, 2)
          else 0
        end)::numeric, 2)
      else 0
    end,
    snapshot_at = now()
  where l.snapshot_at is null;

  -- congelar neto de paquetes en la cabecera, solo si aún no hay snapshot
  update public.beta_tickets t
  set
    neto_pack = coalesce(t.neto_pack, (
      select l.venta_neta from public.beta_ticket_lineas l
      where l.ticket_clave = t.clave and l.tipo = 'paquete' and coalesce(l.cantidad, 0) > 0
        and coalesce(l.precio_unit, 0) > 0
      order by l.orden
      limit 1
    )),
    precios_snapshot_at = coalesce(t.precios_snapshot_at, now())
  where t.precios_snapshot_at is null
    and t.lineas_beta is true;
end $$;
