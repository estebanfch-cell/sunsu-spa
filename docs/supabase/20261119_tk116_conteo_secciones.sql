-- TK116: conteo general por secciones (sububicaciones), como MineCore.
-- SOLO AGREGA: columnas, tablas nuevas y valores extra en el check de bodega.
-- No borra ni cambia filas existentes (siguen siendo «hojas sueltas»).
-- Aprobar sigue sin mover stock.

alter table public.beta_conteos
  add column if not exists tipo text not null default 'hoja';

-- Permite un conteo general (todas las sububicaciones del local).
do $$
declare c name;
begin
  select con.conname into c
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public' and rel.relname = 'beta_conteos' and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%bodega%'
  limit 1;
  if c is not null then
    execute format('alter table public.beta_conteos drop constraint %I', c);
  end if;
  alter table public.beta_conteos
    add constraint beta_conteos_bodega_check
    check (bodega in ('CONSIGNACION','CABINA','OFICINA','TODAS'));
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'beta_conteos_tipo_check'
  ) then
    alter table public.beta_conteos
      add constraint beta_conteos_tipo_check check (tipo in ('hoja','general'));
  end if;
end $$;

create table if not exists public.beta_conteo_secciones (
  id text primary key,
  conteo_id text not null references public.beta_conteos(id) on delete cascade,
  bodega text not null,
  sububicacion text,
  nombre text not null,
  orden integer not null default 0,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','en_conteo','en_revision','aprobada','cancelada')),
  iniciado_at timestamptz, iniciado_por text,
  cerrado_at timestamptz, cerrado_por text,
  aprobado_at timestamptz, aprobado_por text,
  revision_nota text,
  plan_fecha date,
  updated_at timestamptz not null default now()
);
create index if not exists beta_conteo_secciones_conteo on public.beta_conteo_secciones (conteo_id, orden);

alter table public.beta_conteo_lineas add column if not exists seccion_id text;
alter table public.beta_conteo_lineas add column if not exists esperado numeric;
alter table public.beta_conteo_lineas add column if not exists otra_sub text;
alter table public.beta_conteo_lineas add column if not exists otra_qty numeric;
alter table public.beta_conteo_lineas add column if not exists extras jsonb;
alter table public.beta_conteo_lineas add column if not exists buscar boolean not null default false;

create index if not exists beta_conteo_lineas_seccion on public.beta_conteo_lineas (seccion_id);

create table if not exists public.beta_conteo_plan (
  id text primary key,
  conteo_id text not null references public.beta_conteos(id) on delete cascade,
  seccion_id text references public.beta_conteo_secciones(id) on delete cascade,
  fecha date not null,
  created_por text,
  created_at timestamptz not null default now(),
  unique (conteo_id, fecha)
);

alter table public.beta_conteo_secciones enable row level security;
alter table public.beta_conteo_plan enable row level security;

comment on table public.beta_conteo_secciones is 'Secciones de un conteo general (Venta, Oficina, Cabina 1/2/3). Al iniciar se toma el snapshot; al terminar se fija el esperado = stock vivo.';
comment on column public.beta_conteo_lineas.esperado is 'Stock vivo al cerrar la sección (snapshot + movimientos durante el conteo). Null mientras está abierta: se recalcula en vivo.';

do $$
declare t text;
begin
  if exists (select 1 from pg_proc where proname = 'audit_trigger') then
    foreach t in array array['beta_conteo_secciones','beta_conteo_plan'] loop
      if not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = ('public.' || t)::regclass) then
        execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger(''id'')', t);
      end if;
    end loop;
  end if;
end $$;

-- Lista de 0063 más beta_conteo_secciones y beta_conteo_plan. No se quita ninguna.
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
    'beta_conteo_secciones','beta_conteo_plan'];
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
