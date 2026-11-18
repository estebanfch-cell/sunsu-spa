-- 0054_empleados.sql — idempotente. Additive. NO está en supabase/migrations.
-- Overlay de empleados (no pisa rrhh_empleadas, que viene de la hoja),
-- descuentos IESS manuales y documentos. El portal del IESS no se toca.

create table if not exists public.beta_empleados (
  id text primary key,
  nombre_app text not null unique,
  nombre_jibble text,
  usuario_id text,
  afiliada_iess boolean not null default true,
  proveedor_id text,
  notas text,
  origin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.beta_empleados is 'Ficha Sunsu de cada empleada: usuario, afiliación IESS, proveedor de servicios. Los datos de RRHH siguen en rrhh_empleadas.';

create table if not exists public.beta_iess_descuentos (
  id text primary key,
  empleado_id text not null references public.beta_empleados(id) on delete cascade,
  tipo text not null check (tipo in ('quirografario','hipotecario','otro')),
  descripcion text,
  monto numeric(12,2) not null default 0,
  vigente_desde date,
  vigente_hasta date,
  activo boolean not null default true,
  origin text,
  creado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.beta_iess_descuentos is 'Préstamos quirografarios/hipotecarios y otras retenciones, ingresados a mano. Alimentan el rol. No se consulta el portal del IESS.';

create table if not exists public.beta_empleado_docs (
  id text primary key,
  empleado_id text not null references public.beta_empleados(id) on delete cascade,
  nombre text not null,
  mime text,
  storage_path text,
  archivo_id text,
  origin text,
  creado_por text,
  created_at timestamptz not null default now()
);
comment on table public.beta_empleado_docs is 'Documentos de la empleada (contratos, etc.). Solo administración sube y descarga.';

create index if not exists beta_iess_descuentos_emp_idx on public.beta_iess_descuentos (empleado_id);
create index if not exists beta_empleado_docs_emp_idx on public.beta_empleado_docs (empleado_id);

alter table public.beta_empleados enable row level security;
alter table public.beta_iess_descuentos enable row level security;
alter table public.beta_empleado_docs enable row level security;

grant select, insert, update, delete on public.beta_empleados, public.beta_iess_descuentos, public.beta_empleado_docs to sunsu_admin, sunsu_rls, service_role;

do $$
begin
  execute 'drop policy if exists p_admin on public.beta_empleados';
  execute 'create policy p_admin on public.beta_empleados for all to sunsu_admin using (true) with check (true)';
  execute 'drop policy if exists p_staff on public.beta_empleados';
  execute $p$ create policy p_staff on public.beta_empleados for select to sunsu_rls using (true) $p$;

  execute 'drop policy if exists p_admin on public.beta_iess_descuentos';
  execute 'create policy p_admin on public.beta_iess_descuentos for all to sunsu_admin using (true) with check (true)';
  execute 'drop policy if exists p_staff on public.beta_iess_descuentos';
  execute $p$ create policy p_staff on public.beta_iess_descuentos for select to sunsu_rls using (true) $p$;

  execute 'drop policy if exists p_admin on public.beta_empleado_docs';
  execute 'create policy p_admin on public.beta_empleado_docs for all to sunsu_admin using (true) with check (true)';
  -- El staff no lee documentos de compañeras por RLS de postgres; la API igual exige admin.
end $$;

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
    'beta_rol_publicaciones','beta_empleados','beta_iess_descuentos','beta_empleado_docs'];
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
