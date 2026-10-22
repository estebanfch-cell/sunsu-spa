-- 0016_modo_prueba.sql — idempotente. NO está en supabase/migrations.
-- APLICAR ANTES de encender Modo prueba. Sin estas columnas, app_write
-- se salta origin y un alta de prueba quedaría como dato real.
--
-- sesiones.modo_prueba es por sesión. origin = 'test' marca la fila.
-- La serie visible lleva prefijo TEST- (no consume next_ticket_num ni next_oc_num).
-- tickets_reimportar trata 'test' como 'beta': no borra ni pisa esas filas.
-- No hay import.py en este repo. El importador externo tiene que usar el mismo filtro.
-- prueba_purgar borra solo origin = 'test' y deja un log real (sin origin test).
-- El trigger del kardex y el de asistencia dejan pasar ese delete.
-- tickets_conservar_beta sigue bloqueando el delete de origin = 'beta'.

alter table public.sesiones add column if not exists modo_prueba boolean not null default false;

do $$
declare t text;
begin
  foreach t in array array[
    'tickets','erp_ordenes_venta','erp_ov_lineas','cotizaciones',
    'erp_oc','erp_oc_lineas','erp_recepciones','erp_recepcion_lineas',
    'erp_movimientos','gift_card_movimientos','gift_cards','clientas_registro',
    'asistencia_marcajes','asistencia_auditoria','permisos','paquetes',
    'erp_rfq','erp_rfq_lineas','erp_rfq_prov',
    'erp_transferencias','erp_transferencia_lineas',
    'erp_conteos','erp_conteo_lineas','erp_ajustes','erp_avisos',
    'erp_tickets_procesados','erp_clientes','erp_proveedores','erp_productos',
    'log_acciones','ordenes_compra','caja_chica','propinas','multas_descuentos',
    'app_archivos','cabina_ordenes','roles_aprobados','historial_comisiones',
    'erp_stock','erp_locales','erp_consignacion_consumo'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists origin text', t);
    end if;
  end loop;
end $$;

alter table public.tickets drop constraint if exists tickets_origin_chk;
alter table public.tickets add constraint tickets_origin_chk check (origin in ('sheet', 'beta', 'test'));

create or replace function public.tickets_conservar_beta() returns trigger
language plpgsql as $$
begin
  if coalesce(old.origin, 'sheet') = 'test' then
    return old;
  end if;
  if coalesce(old.origin, 'sheet') = 'beta' then
    return null;
  end if;
  return old;
end $$;

create or replace function public.erp_no_borra_kardex() returns trigger language plpgsql as $$
begin
  if coalesce(old.origin, '') = 'test' then
    return old;
  end if;
  raise exception 'El kardex no se borra. Se anula con el movimiento inverso.';
end $$;

create or replace function public.asis_no_borrar() returns trigger language plpgsql as $$
begin
  if coalesce(old.origin, '') = 'test' then
    return old;
  end if;
  if current_setting('app.asis_purga', true) = 'si' then
    return old;
  end if;
  raise exception 'En asistencia no se borra: se anula con motivo';
end $$;

create or replace function public.tickets_reimportar(p_filas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fila jsonb;
  sr int;
  col text;
  cols text[] := array[]::text[];
  exprs text[] := array[]::text[];
  sets text[] := array[]::text[];
  q text;
  n_del int := 0;
  n_up int := 0;
  n_skip int := 0;
begin
  perform set_config('app.user', 'reimport', true);
  delete from public.tickets
  where sheet_row is not null
    and coalesce(origin, 'sheet') not in ('beta', 'test');
  get diagnostics n_del = row_count;

  for fila in select value from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) loop
    sr := nullif(fila->>'sheet_row', '')::int;
    if sr is null then
      n_skip := n_skip + 1;
      continue;
    end if;
    if exists (select 1 from public.tickets t where t.sheet_row = sr and t.origin in ('beta', 'test')) then
      n_skip := n_skip + 1;
      continue;
    end if;
    fila := (fila - 'id' - 'beta_num') || jsonb_build_object('origin', 'sheet', 'sheet_row', sr);
    if fila->'orig' is null or fila->'orig' = 'null'::jsonb then
      fila := jsonb_set(fila, '{orig}', '{}'::jsonb);
    end if;

    if exists (select 1 from public.tickets t where t.sheet_row = sr) then
      sets := array[]::text[];
      for col in select jsonb_object_keys(fila) loop
        if col !~ '^[a-z_][a-z0-9_]*$' then continue; end if;
        if col in ('id', 'sheet_row') then continue; end if;
        if not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'tickets' and c.column_name = col) then continue; end if;
        sets := sets || format('%I = (jsonb_populate_record(null::public.tickets, $1)).%I', col, col);
      end loop;
      if coalesce(array_length(sets, 1), 0) > 0 then
        q := format('update public.tickets set %s where sheet_row = $2 and coalesce(origin, ''sheet'') not in (''beta'', ''test'')', array_to_string(sets, ','));
        execute q using fila, sr;
        n_up := n_up + 1;
      end if;
    else
      cols := array[]::text[];
      exprs := array[]::text[];
      for col in select jsonb_object_keys(fila) loop
        if col !~ '^[a-z_][a-z0-9_]*$' then continue; end if;
        if not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'tickets' and c.column_name = col) then continue; end if;
        cols := cols || quote_ident(col);
        exprs := exprs || format('(jsonb_populate_record(null::public.tickets, $1)).%I', col);
      end loop;
      if coalesce(array_length(cols, 1), 0) = 0 then
        n_skip := n_skip + 1;
        continue;
      end if;
      q := format('insert into public.tickets (%s) select %s', array_to_string(cols, ','), array_to_string(exprs, ','));
      execute q using fila;
      n_up := n_up + 1;
    end if;
  end loop;

  return jsonb_build_object('borradas', n_del, 'escritas', n_up, 'omitidas', n_skip);
end $$;

revoke all on function public.tickets_reimportar(jsonb) from public, anon, authenticated;
grant execute on function public.tickets_reimportar(jsonb) to service_role;

create or replace function public.prueba_purgar(p_actor text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  tablas text[] := array[
    'tickets','erp_ordenes_venta','erp_ov_lineas','cotizaciones',
    'erp_oc','erp_oc_lineas','erp_recepciones','erp_recepcion_lineas',
    'erp_movimientos','gift_card_movimientos','gift_cards','clientas_registro',
    'asistencia_marcajes','asistencia_auditoria','permisos','paquetes',
    'erp_rfq','erp_rfq_lineas','erp_rfq_prov',
    'erp_transferencias','erp_transferencia_lineas',
    'erp_conteos','erp_conteo_lineas','erp_ajustes','erp_avisos',
    'erp_tickets_procesados','erp_clientes','erp_proveedores','erp_productos',
    'log_acciones','ordenes_compra','caja_chica','propinas','multas_descuentos',
    'app_archivos','cabina_ordenes','roles_aprobados','historial_comisiones',
    'erp_stock','erp_locales','erp_consignacion_consumo'
  ];
  t text;
  n int;
  total int := 0;
  counts jsonb := '{}'::jsonb;
  sr int;
begin
  if coalesce(btrim(p_actor), '') = '' then
    raise exception 'actor requerido';
  end if;
  perform set_config('app.user', p_actor, true);
  foreach t in array tablas loop
    if to_regclass('public.' || t) is null then continue; end if;
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = t and c.column_name = 'origin'
    ) then continue; end if;
    execute format('delete from public.%I where origin = %L', t, 'test');
    get diagnostics n = row_count;
    if n > 0 then
      counts := counts || jsonb_build_object(t, n);
      total := total + n;
    end if;
  end loop;
  select coalesce(max(sheet_row), 0) + 1 into sr from public.log_acciones;
  insert into public.log_acciones (sheet_row, fecha, usuario, accion, detalle, orig)
  values (
    sr,
    to_char(now() at time zone 'America/Guayaquil', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    p_actor,
    'PURGA PRUEBA',
    counts::text,
    jsonb_build_object('accion', 'PURGA PRUEBA', 'detalle', counts, 'usuario', p_actor, 'borradas', total)
  );
  return jsonb_build_object('ok', true, 'borradas', total, 'tablas', counts);
end $$;

revoke all on function public.prueba_purgar(text) from public, anon, authenticated;
grant execute on function public.prueba_purgar(text) to service_role;
