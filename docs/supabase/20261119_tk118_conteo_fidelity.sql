-- TK118: sububicaciones (estantes) por bodega/cabina, sin sembrar nada.
-- Quita solo las 5 secciones placeholder de TK117 si no se usaron en un conteo.
-- NO toca beta_conteos ni beta_conteo_lineas (CF-001 real se queda).
-- SOLO AGREGA tablas/columnas. Backup primero.

create table if not exists public._bak_20261119_tk118_zonas as
  select * from public.beta_conteo_zonas;

create table if not exists public.beta_sububicaciones (
  id text primary key,
  bodega text not null check (bodega in ('CONSIGNACION','CABINA','OFICINA')),
  padre text,
  codigo text not null,
  nombre text,
  activo boolean not null default true,
  created_por text,
  created_at timestamptz not null default now(),
  updated_por text,
  updated_at timestamptz not null default now(),
  unique (bodega, codigo)
);
create index if not exists beta_sububicaciones_bod on public.beta_sububicaciones (bodega, padre, codigo);
alter table public.beta_sububicaciones enable row level security;
comment on table public.beta_sububicaciones is 'Estantes/cajones dentro de una bodega o cabina. Se crean uno a uno (⚙ Secciones o en el conteo). Vacío al inicio.';

do $$
begin
  if exists (select 1 from pg_proc where proname = 'audit_trigger') then
    if not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = 'public.beta_sububicaciones'::regclass) then
      create trigger trg_audit after insert or update or delete on public.beta_sububicaciones
        for each row execute function public.audit_trigger('id');
    end if;
  end if;
end $$;

-- Solo placeholders de TK117, y solo si no hay secciones de un conteo que las usen.
delete from public.beta_conteo_zonas z
 where z.id in ('zona-venta','zona-oficina','zona-cab1','zona-cab2','zona-cab3')
   and not exists (
     select 1 from public.beta_conteo_secciones s
      where s.zona_id = z.id
         or (s.bodega = z.bodega and coalesce(s.sububicacion,'') = coalesce(z.sububicacion,''))
   );

-- Lista TK117 + beta_sububicaciones. No se quita ninguna.
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
    'beta_rol_publicaciones','beta_empleados','beta_iess_descuentos','beta_empleado_docs','beta_roles','beta_roles_log','beta_asistencia_horas_mes','beta_asistencia_horas_log','beta_ticket_snaps',
    'beta_conteo_secciones','beta_conteo_plan','beta_conteo_zonas','erp_sububicaciones','beta_sububicaciones'];
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
