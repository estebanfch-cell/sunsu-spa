-- 0018_horarios.sql — incremental e idempotente. NO va en supabase/migrations.
-- Horarios al estilo Jibble (fijo, flexible, semanal, rotativo), asignación por
-- persona, suscripciones push y el registro de avisos ya enviados.
-- No inserta horarios: en el entorno de build no estaban JIBBLE_CLIENT_ID ni
-- JIBBLE_CLIENT_SECRET, así que no se pudo leer Jibble. Las tablas nacen vacías.
-- Después del deploy, un admin pulsa Traer de Jibble.
--
--   supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0018_horarios.sql

create table if not exists public.horarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  arreglo text not null check (arreglo in ('fijo','flexible','semanal','rotativo')),
  es_default boolean not null default false,
  descansos_tipo text not null default 'impago' check (descansos_tipo in ('pago','impago')),
  excluir_temprana boolean not null default false,
  horas_semana numeric,
  fin_jornada text,
  ciclo_dias int,
  ancla date,
  jibble_id text,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create unique index if not exists horarios_jibble_id_idx on public.horarios (jibble_id) where jibble_id is not null;
create unique index if not exists horarios_un_default_idx on public.horarios ((es_default)) where es_default;
comment on table public.horarios is 'Horario de trabajo al estilo Jibble. Uno puede ser el de por defecto. Un ciclo rotativo usa ciclo_dias y ancla.';

create table if not exists public.horario_dias (
  id bigserial primary key,
  horario_id uuid not null references public.horarios(id) on delete cascade,
  orden int not null default 0,
  dia text not null,
  trabaja boolean not null default true,
  desde text,
  hasta text,
  duracion_min int
);
create index if not exists horario_dias_horario_idx on public.horario_dias (horario_id);

create table if not exists public.horario_descansos (
  id bigserial primary key,
  horario_id uuid not null references public.horarios(id) on delete cascade,
  nombre text not null default '',
  duracion_min int not null default 0,
  desde text,
  hasta text,
  franja boolean not null default false
);

create table if not exists public.horario_deducciones (
  id bigserial primary key,
  horario_id uuid not null references public.horarios(id) on delete cascade,
  nombre text not null default '',
  duracion_min int not null default 0,
  umbral_min int not null default 0
);

create table if not exists public.horario_asignaciones (
  persona text primary key,
  horario_id uuid references public.horarios(id) on delete set null,
  origen text not null default 'persona' check (origen in ('persona','grupo','default')),
  grupo text,
  jibble_person_id text
);
comment on table public.horario_asignaciones is 'Una persona, un horario. Si no hay fila, usa el horario marcado por defecto. Persona gana a grupo, y grupo al de por defecto.';

create table if not exists public.push_suscripciones (
  endpoint text primary key,
  persona text not null,
  uid text not null default '',
  p256dh text not null,
  auth text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.horario_avisos (
  id bigserial primary key,
  persona text not null,
  fecha date not null,
  tipo text not null check (tipo in ('entrada','salida')),
  enviado_at timestamptz not null default now(),
  unique (persona, fecha, tipo)
);
comment on table public.horario_avisos is 'Un aviso de entrada o de salida por persona y día, para no repetir el push.';

alter table public.horarios enable row level security;
alter table public.horario_dias enable row level security;
alter table public.horario_descansos enable row level security;
alter table public.horario_deducciones enable row level security;
alter table public.horario_asignaciones enable row level security;
alter table public.push_suscripciones enable row level security;
alter table public.horario_avisos enable row level security;

do $$
declare t text;
begin
  if exists (select 1 from pg_roles where rolname = 'sunsu_admin') then
    execute 'grant select, insert, update, delete on public.horarios, public.horario_dias, public.horario_descansos, public.horario_deducciones, public.horario_asignaciones, public.push_suscripciones, public.horario_avisos to sunsu_admin';
  end if;
  if exists (select 1 from pg_roles where rolname = 'sunsu_rls') then
    execute 'grant select on public.horarios, public.horario_dias, public.horario_descansos, public.horario_deducciones, public.horario_asignaciones, public.push_suscripciones, public.horario_avisos to sunsu_rls';
    foreach t in array array['horarios','horario_dias','horario_descansos','horario_deducciones'] loop
      execute format('drop policy if exists p_staff on public.%I', t);
      execute format($p$ create policy p_staff on public.%I for select to sunsu_rls using (public.app_acceso('asistencia') <> 'no') $p$, t);
    end loop;
    execute 'drop policy if exists p_staff on public.horario_asignaciones';
    execute $p$ create policy p_staff on public.horario_asignaciones for select to sunsu_rls using (
      public.app_acceso('asistencia') = 'todos' or (public.app_acceso('asistencia') = 'propio' and public.app_es_propio(persona))
    ) $p$;
    execute 'drop policy if exists p_staff on public.push_suscripciones';
    execute $p$ create policy p_staff on public.push_suscripciones for select to sunsu_rls using (public.app_es_propio(persona)) $p$;
    execute 'drop policy if exists p_staff on public.horario_avisos';
    execute $p$ create policy p_staff on public.horario_avisos for select to sunsu_rls using (
      public.app_acceso('asistencia') = 'todos' or (public.app_acceso('asistencia') = 'propio' and public.app_es_propio(persona))
    ) $p$;
  end if;
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
    'erp_tickets_procesados','erp_avisos','erp_servicios','erp_receta','erp_movimientos',
    'asistencia_config','asistencia_marcajes','asistencia_auditoria','asistencia_feriados','jibble_historial',
    'gift_card_movimientos','erp_locales','erp_consignacion_consumo',
    'horarios','horario_dias','horario_descansos','horario_deducciones','horario_asignaciones','push_suscripciones','horario_avisos'
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

alter table public.erp_locales enable row level security;
alter table public.erp_consignacion_consumo enable row level security;
drop policy if exists p_staff on public.erp_locales;
drop policy if exists p_staff on public.erp_consignacion_consumo;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sunsu_rls') then
    execute $p$ create policy p_staff on public.erp_locales for select to sunsu_rls using (true) $p$;
    execute $p$ create policy p_staff on public.erp_consignacion_consumo for select to sunsu_rls using (public.app_acceso('compras') <> 'no' or public.app_acceso('inventario') <> 'no') $p$;
  end if;
end $$;
