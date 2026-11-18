-- TK34 (Emilia 18/11): ficha del proveedor + interruptor 🤝 Consignación por proveedor (= familia).
-- Aditivo: tabla nueva, siembra HT/AS/ML/PH/JN en ON (lo que regía hasta hoy) y agrega la tabla a app_beta_write.
-- erp_productos.beta_origen no cambia: null = hereda del proveedor; "propio" = apagado en ese producto.
create table if not exists public.beta_proveedores_ficha (
  familia text primary key,
  consignacion boolean not null default false,
  datos jsonb not null default '{}'::jsonb,
  notas jsonb not null default '[]'::jsonb,
  historial jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.beta_proveedores_ficha enable row level security;
drop policy if exists beta_proveedores_ficha_select on public.beta_proveedores_ficha;
create policy beta_proveedores_ficha_select on public.beta_proveedores_ficha for select to anon, authenticated, service_role using (true);
comment on table public.beta_proveedores_ficha is 'Ficha beta del proveedor (por código de familia): consignación ON/OFF, datos extra, notas, historial.';

insert into public.beta_proveedores_ficha (familia, consignacion, historial)
select f, true, jsonb_build_array(jsonb_build_object('fecha', now(), 'actor', 'Grok Bot', 'accion', 'consignación ON (como regía hasta TK33)'))
from unnest(array['HT','AS','ML','PH','JN']) f
on conflict (familia) do nothing;

do $t$ begin
  if exists (select 1 from pg_proc where proname = 'audit_trigger') and not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = 'public.beta_proveedores_ficha'::regclass) then
    execute 'create trigger trg_audit after insert or update or delete on public.beta_proveedores_ficha for each row execute function public.audit_trigger(''familia'')';
  end if;
end $t$;

-- app_beta_write: lista vigente (20261118_migo_cuadre.sql) + beta_proveedores_ficha.
CREATE OR REPLACE FUNCTION public.app_beta_write(p_actor text, p_table text, p_op text, p_match jsonb, p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  allowed text[] := array['beta_conteos','beta_promociones','beta_conteo_lineas','beta_notificaciones','beta_transferencias','beta_transferencia_lineas','beta_ajustes','beta_ajuste_lineas','beta_stock','beta_stock_movimientos','beta_tickets','beta_ticket_lineas','beta_clientes','beta_cliente_notas',
    'beta_acuity_calendars','beta_citas_ticket','beta_ticket_envios','beta_ventas','beta_venta_lineas','beta_pagos','beta_caja_movimientos','beta_caja_cierres',
    'beta_paquetes','beta_paquete_usos','beta_gift_cards','beta_gift_movimientos','beta_permisos_usuario','beta_ticket_flags','beta_ticket_cancelados','beta_aperturas','beta_paquete_ajustes','beta_multa_tipos','beta_multas','beta_cliente_documentos','beta_credenciales','beta_pagos','beta_caja_movimientos','beta_caja_cierres','beta_gift_ajustes','beta_gift_documentos','beta_cliente_alias','beta_oc_cotizaciones','beta_consig_restock','beta_actas',
    'beta_migo_facturas_vivo','beta_migo_importes','beta_cuadre_link','beta_migo_borradores','beta_proveedores_ficha'];
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
end $function$
;
