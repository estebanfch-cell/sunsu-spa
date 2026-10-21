-- 0010_asistencia.sql — incremental e idempotente. NO va en supabase/migrations.
-- Asistencia propia (reemplaza el reloj de Jibble). 0008 y 0009 ya aplicados.
-- jibble_historial queda vacío: el histórico lo importa el coordinador.
--
--   supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0010_asistencia.sql

create table if not exists public.asistencia_config (
  id int primary key default 1 check (id = 1),
  lat double precision,
  lng double precision,
  radio_m numeric not null default 150 check (radio_m > 0),
  exigir_geo boolean not null default false,
  exigir_selfie boolean not null default false,
  hora_entrada text not null default '09:00',
  hora_salida text not null default '18:00',
  jornada_horas numeric not null default 8 check (jornada_horas > 0 and jornada_horas <= 12),
  gracia_min int not null default 10 check (gracia_min >= 0),
  cuenta_antes boolean not null default false
);
insert into public.asistencia_config (id) values (1) on conflict (id) do nothing;
comment on table public.asistencia_config is 'Radio del spa y reglas del reloj. exigir_geo/exigir_selfie empiezan apagados hasta que un admin guarde el punto.';

create table if not exists public.asistencia_marcajes (
  id uuid primary key default gen_random_uuid(),
  usuario_id text not null,
  nombre text not null,
  tipo text not null check (tipo in ('entrada','salida','almuerzo_inicio','almuerzo_fin')),
  ts timestamptz not null,
  lat double precision,
  lng double precision,
  precision_m numeric,
  dentro_radio boolean,
  foto text,
  origen text not null default 'telefono' check (origen in ('telefono','recepcion')),
  anulado boolean not null default false,
  motivo_anulacion text,
  created_at timestamptz not null default now()
);
create index if not exists asistencia_marcajes_nombre_ts_idx on public.asistencia_marcajes (nombre, ts desc);
comment on table public.asistencia_marcajes is 'Reloj propio. La hora la pone el servidor. Una corrección anula o edita y queda en asistencia_auditoria.';

create table if not exists public.asistencia_auditoria (
  id bigserial primary key,
  ts timestamptz not null default now(),
  actor text not null,
  accion text not null,
  nombre text not null default '',
  marcaje_id text,
  permiso_sheet_row int,
  antes jsonb,
  despues jsonb,
  motivo text
);
create index if not exists asistencia_auditoria_ts_idx on public.asistencia_auditoria (ts desc);
comment on table public.asistencia_auditoria is 'Quién cambió una marca, una regla o un permiso. No guarda la selfie.';

create table if not exists public.asistencia_feriados (
  fecha date primary key,
  nombre text not null default ''
);
comment on table public.asistencia_feriados is 'Feriados que se pagan como descanso (+100%). Sábado y domingo ya cuentan sin estar aquí.';

-- Histórico de Jibble. Vacía hasta que el coordinador importe. Un día con marcaje propio no se mezcla con esta fila.
create table if not exists public.jibble_historial (
  id bigserial primary key,
  persona text not null,
  person_id text,
  fecha date not null,
  payroll_minutes numeric not null default 0,
  supplementary_minutes numeric not null default 0,
  extraordinary_minutes numeric not null default 0,
  rest_day_minutes numeric not null default 0,
  raw jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  unique (persona, fecha)
);
comment on table public.jibble_historial is 'Import de timesheets Jibble (payroll / suplementarias / extraordinarias / descanso, en minutos). Lo carga el coordinador; la app no lo escribe.';

alter table public.asistencia_config enable row level security;
alter table public.asistencia_marcajes enable row level security;
alter table public.asistencia_auditoria enable row level security;
alter table public.asistencia_feriados enable row level security;
alter table public.jibble_historial enable row level security;

grant select, insert, update, delete on
  public.asistencia_config, public.asistencia_marcajes, public.asistencia_auditoria,
  public.asistencia_feriados, public.jibble_historial
  to sunsu_admin, sunsu_rls;
grant usage, select on all sequences in schema public to sunsu_admin, sunsu_rls;

do $$
declare t text;
begin
  foreach t in array array['asistencia_config','asistencia_marcajes','asistencia_auditoria','asistencia_feriados','jibble_historial'] loop
    execute format('drop policy if exists p_admin on public.%I', t);
    execute format('create policy p_admin on public.%I for all to sunsu_admin using (true) with check (true)', t);
  end loop;

  execute 'drop policy if exists p_staff on public.asistencia_marcajes';
  execute $p$ create policy p_staff on public.asistencia_marcajes for select to sunsu_rls using (
    public.app_acceso('asistencia') = 'todos'
    or (public.app_acceso('asistencia') = 'propio' and public.app_es_propio(nombre))
  ) $p$;

  execute 'drop policy if exists p_staff on public.asistencia_auditoria';
  execute $p$ create policy p_staff on public.asistencia_auditoria for select to sunsu_rls using (
    public.app_acceso('asistencia') = 'todos'
    or (public.app_acceso('asistencia') = 'propio' and public.app_es_propio(nombre))
  ) $p$;

  execute 'drop policy if exists p_staff on public.jibble_historial';
  execute $p$ create policy p_staff on public.jibble_historial for select to sunsu_rls using (
    public.app_acceso('asistencia') = 'todos'
    or (public.app_acceso('asistencia') = 'propio' and public.app_es_propio(persona))
  ) $p$;

  execute 'drop policy if exists p_staff on public.asistencia_config';
  execute $p$ create policy p_staff on public.asistencia_config for select to sunsu_rls using (public.app_acceso('asistencia') <> 'no') $p$;
  execute 'drop policy if exists p_staff on public.asistencia_feriados';
  execute $p$ create policy p_staff on public.asistencia_feriados for select to sunsu_rls using (public.app_acceso('asistencia') <> 'no') $p$;

  execute 'drop policy if exists p_staff on public.permisos';
  execute $p$ create policy p_staff on public.permisos for select to sunsu_rls using (
    public.app_acceso('asistencia') = 'todos'
    or (public.app_acceso('asistencia') = 'propio' and public.app_es_propio(empleada))
  ) $p$;
end $$;

create or replace function public.app_write(
  p_actor text, p_table text, p_op text, p_match jsonb, p_row jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  allowed text[] := array[
    'tickets','clientas_registro','clientas_antiguas','paquetes','gift_cards',
    'historial_ventas','catalogo','inventario_entradas','inventario_fisico',
    'proveedores','ordenes_compra','promos','propinas','envios_tarjetas',
    'roles_aprobados','multas_descuentos','permisos','caja_chica','log_acciones',
    'configuracion','cabina_inventario','cabina_bitacora','cabina_traspasos',
    'cabina_activos','cabina_protocolos','cabina_protocolo_pasos','cabina_consumos',
    'cabina_aperturas','cabina_ordenes','cabina_bajas','rrhh_empleadas','rrhh_historial',
    'cotizaciones','usuarios','sesiones','app_kv','app_archivos','inventario_base',
    'cosmetologas','ciclo_override','config_comisiones','app_modulos','login_intentos',
    'app_usuarios','gift_cards_digitales','seguimiento_memoria','tarjetas_enviadas',
    'wa_enviados','historial_comisiones','cabina_fotos','app_settings',
    'erp_bodegas','erp_productos','erp_producto_bodega','erp_stock','erp_proveedores',
    'erp_clientes','erp_rfq','erp_rfq_prov','erp_rfq_lineas','erp_oc','erp_oc_lineas',
    'erp_recepciones','erp_recepcion_lineas','erp_transferencias','erp_transferencia_lineas',
    'erp_conteos','erp_conteo_lineas','erp_ajustes','erp_ordenes_venta','erp_ov_lineas',
    'erp_tickets_procesados','erp_avisos','erp_servicios','erp_receta',
    'asistencia_config','asistencia_marcajes','asistencia_auditoria','asistencia_feriados','jibble_historial'
  ];
  col text; cols text[] := array[]::text[]; exprs text[] := array[]::text[];
  sets text[] := array[]::text[]; wh text[] := array[]::text[]; rec jsonb; q text;
begin
  if coalesce(btrim(p_actor), '') = '' then raise exception 'actor requerido'; end if;
  if p_table = 'erp_movimientos' and p_op = 'delete' then
    raise exception 'El kardex no se borra';
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
end $$;
revoke all on function public.app_write(text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.app_write(text, text, text, jsonb, jsonb) to service_role;

select public.audit_attach_all();
