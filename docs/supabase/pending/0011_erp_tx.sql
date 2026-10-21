-- PENDIENTE. Aplicar ANTES de desplegar el edge de este PR.
-- No poner este archivo en supabase/migrations (la integración lo re-aplicaría).
-- Idempotente. No llama erp_importar_legado() ni audit_attach_all().
--
-- Tickets creados en la beta: origin = 'beta', sheet_row nulo, beta_num propio.
-- Un DELETE de tickets no borra origin = 'beta' (RETURNING NULL solo salta esa fila).
-- TRUNCATE sí las borra: la reimportación de la hoja usa tickets_reimportar o DELETE.
-- erp_tx aplica ov_save, ticket_aplicar, ov_anular, oc_recibir y pago_save
-- en una sola transacción y sigue la numeración OV después de lo importado
-- (TK-ROW-80 → OV-0081).

alter table public.tickets add column if not exists origin text;
alter table public.tickets add column if not exists beta_num text;
alter table public.tickets alter column sheet_row drop not null;

update public.tickets
set beta_num = coalesce(nullif(btrim(beta_num), ''), case when sheet_row is not null then 'B-' || sheet_row::text else beta_num end),
    origin = 'beta',
    sheet_row = null
where coalesce(origin, 'sheet') <> 'beta'
  and (
    coalesce(orig->>'fuente', '') = 'ov_save'
    or coalesce(orig->>'beta', '') = 'true'
  );

update public.tickets set origin = 'sheet' where origin is null;

alter table public.tickets alter column origin set default 'sheet';
alter table public.tickets alter column origin set not null;

alter table public.tickets drop constraint if exists tickets_origin_chk;
alter table public.tickets add constraint tickets_origin_chk check (origin in ('sheet', 'beta'));

create unique index if not exists tickets_beta_num_uidx on public.tickets (beta_num) where beta_num is not null;

create or replace function public.tickets_conservar_beta() returns trigger
language plpgsql as $$
begin
  if coalesce(old.origin, 'sheet') = 'beta' then
    return null;
  end if;
  return old;
end $$;

drop trigger if exists trg_tickets_conservar_beta on public.tickets;
create trigger trg_tickets_conservar_beta
  before delete on public.tickets
  for each row execute function public.tickets_conservar_beta();

revoke all on function public.tickets_conservar_beta() from public, anon, authenticated;

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
  delete from public.tickets where coalesce(origin, 'sheet') <> 'beta';
  get diagnostics n_del = row_count;

  for fila in select value from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) loop
    sr := nullif(fila->>'sheet_row', '')::int;
    if sr is null then
      n_skip := n_skip + 1;
      continue;
    end if;
    if exists (select 1 from public.tickets t where t.sheet_row = sr and t.origin = 'beta') then
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
        q := format('update public.tickets set %s where sheet_row = $2 and origin <> ''beta''', array_to_string(sets, ','));
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

create or replace function public.erp_tx(
  p_actor text, p_op text, p_steps jsonb, p_now timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  step jsonb;
  elem jsonb;
  rebuilt jsonb;
  op text;
  tbl text;
  matchj jsonb;
  rowj jsonb;
  col text;
  cols text[];
  exprs text[];
  sets text[];
  wh text[];
  q text;
  rec jsonb;
  maxn bigint := 0;
  cnt bigint := 0;
  suf bigint;
  proposed text;
  numero_out text;
  pid uuid;
  bid uuid;
  delta numeric;
  hay numeric;
  queda numeric;
  stock_id bigint;
  sub text;
  lote text;
  legacy text;
  tipo text;
  doc uuid;
  aprobado boolean;
  antes numeric;
  oldc numeric;
  costo numeric;
  den numeric;
  allowed text[] := array[
    'tickets','erp_ordenes_venta','erp_ov_lineas','erp_tickets_procesados',
    'erp_oc','erp_oc_lineas','erp_recepciones','erp_recepcion_lineas',
    'erp_productos','erp_stock'
  ];
begin
  if coalesce(btrim(p_actor), '') = '' then raise exception 'actor requerido'; end if;
  if p_op not in ('ov_save', 'ticket_aplicar', 'ov_anular', 'oc_recibir', 'pago_save') then
    raise exception 'op no atomica: %', p_op;
  end if;
  perform set_config('app.user', p_actor, true);
  perform pg_advisory_xact_lock(481516234);

  if p_op in ('ov_save', 'ticket_aplicar') then
    select coalesce(max((regexp_match(numero, '([0-9]+)$'))[1]::bigint), 0)
      into maxn
      from public.erp_ordenes_venta
      where numero ~ '[0-9]+$';
    if maxn = 0 then
      select count(*) into cnt from public.erp_ordenes_venta;
      maxn := cnt;
    end if;
    numero_out := 'OV-' || lpad((maxn + 1)::text, 4, '0');
    select s->'row'->>'numero' into proposed
      from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) s
      where s->>'op' = 'upsert' and s->>'table' = 'erp_ordenes_venta'
      limit 1;
    if proposed ~ '^OV-[0-9]+$' then
      suf := substring(proposed from 4)::bigint;
      if suf > maxn and not exists (select 1 from public.erp_ordenes_venta o where o.numero = proposed) then
        numero_out := proposed;
      end if;
    end if;
    rebuilt := '[]'::jsonb;
    for elem in select value from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) loop
      if proposed is not null and proposed <> '' and proposed is distinct from numero_out then
        elem := replace(elem::text, to_jsonb(proposed)::text, to_jsonb(numero_out)::text)::jsonb;
      elsif (proposed is null or proposed = '') and elem->>'op' = 'upsert' and elem->>'table' = 'erp_ordenes_venta' then
        elem := jsonb_set(elem, '{row,numero}', to_jsonb(numero_out));
      end if;
      rebuilt := rebuilt || jsonb_build_array(elem);
    end loop;
    p_steps := rebuilt;
  end if;

  for step in select value from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) loop
    op := step->>'op';
    if op = 'upsert' or op = 'delete' then
      tbl := step->>'table';
      if not (tbl = any (allowed)) then raise exception 'tabla no permitida en erp_tx: %', tbl; end if;
      matchj := coalesce(step->'match', '{}'::jsonb);
      rowj := coalesce(step->'row', '{}'::jsonb);
      wh := array[]::text[];
      if matchj <> '{}'::jsonb then
        for col in select jsonb_object_keys(matchj) loop
          if col !~ '^[a-z_][a-z0-9_]*$' then raise exception 'columna invalida: %', col; end if;
          wh := wh || format('%I is not distinct from (jsonb_populate_record(null::public.%I, $1)).%I', col, tbl, col);
        end loop;
      end if;
      rec := null;
      if coalesce(array_length(wh, 1), 0) > 0 then
        q := format('select to_jsonb(t) from public.%I t where %s limit 1', tbl, array_to_string(wh, ' and '));
        execute q into rec using matchj;
      end if;

      if op = 'delete' then
        if coalesce(array_length(wh, 1), 0) = 0 then raise exception 'delete sin filtro'; end if;
        q := format('delete from public.%I where %s', tbl, array_to_string(wh, ' and '));
        execute q using matchj;
        continue;
      end if;

      if rec is not null then
        sets := array[]::text[];
        for col in select jsonb_object_keys(rowj) loop
          if col !~ '^[a-z_][a-z0-9_]*$' then raise exception 'columna invalida: %', col; end if;
          if col = 'id' then continue; end if;
          if not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = tbl and c.column_name = col) then continue; end if;
          sets := sets || format('%I = (jsonb_populate_record(null::public.%I, $1)).%I', col, tbl, col);
        end loop;
        if coalesce(array_length(sets, 1), 0) = 0 then raise exception 'update vacio'; end if;
        q := format('update public.%I set %s where %s', tbl, array_to_string(sets, ','), replace(array_to_string(wh, ' and '), '$1', '$2'));
        execute q using rowj, matchj;
      else
        rowj := matchj || rowj;
        cols := array[]::text[];
        exprs := array[]::text[];
        for col in select jsonb_object_keys(rowj) loop
          if col !~ '^[a-z_][a-z0-9_]*$' then raise exception 'columna invalida: %', col; end if;
          if not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = tbl and c.column_name = col) then continue; end if;
          cols := cols || quote_ident(col);
          exprs := exprs || format('(jsonb_populate_record(null::public.%I, $1)).%I', tbl, col);
        end loop;
        if coalesce(array_length(cols, 1), 0) = 0 then raise exception 'insert vacio'; end if;
        q := format('insert into public.%I (%s) select %s', tbl, array_to_string(cols, ','), array_to_string(exprs, ','));
        execute q using rowj;
      end if;

    elsif op = 'move' then
      legacy := nullif(step->>'legacy_ref', '');
      if legacy is not null and exists (select 1 from public.erp_movimientos m where m.legacy_ref = legacy) then
        continue;
      end if;
      pid := nullif(step->>'producto_id', '')::uuid;
      bid := nullif(step->>'bodega_id', '')::uuid;
      delta := (step->>'delta')::numeric;
      tipo := step->>'tipo';
      sub := coalesce(step->>'sububicacion', '');
      lote := coalesce(step->>'lote', '');
      stock_id := null;
      hay := 0;
      select s.id, s.cantidad into stock_id, hay
        from public.erp_stock s
        where s.producto_id = pid and s.bodega_id = bid and s.sububicacion = sub and s.lote = lote
        for update;
      if not found then
        stock_id := null;
        hay := 0;
      end if;
      queda := round(coalesce(hay, 0) + delta, 4);
      aprobado := coalesce(step->>'aprobar_negativo', '') in ('true', 't', '1', 'TRUE');
      if queda < -0.000001 and not aprobado then
        raise exception 'NEGATIVO %', jsonb_build_object(
          'sku', coalesce((select sku from public.erp_productos where id = pid), ''),
          'producto', coalesce((select nombre from public.erp_productos where id = pid), ''),
          'bodega', coalesce((select nombre from public.erp_bodegas where id = bid), ''),
          'hay', round(coalesce(hay, 0), 4),
          'piden', round(abs(delta), 4),
          'queda', queda
        )::text;
      end if;
      if stock_id is null then
        insert into public.erp_stock (producto_id, bodega_id, sububicacion, lote, cantidad)
        values (pid, bid, sub, lote, queda);
      else
        update public.erp_stock set cantidad = queda, updated_at = now() where id = stock_id;
      end if;
      doc := nullif(step->>'doc_id', '')::uuid;
      insert into public.erp_movimientos (
        fecha, actor, producto_id, bodega_id, sububicacion, lote, delta, saldo, costo_unit,
        tipo, doc_tipo, doc_id, ticket_ref, aprobado_negativo_por, nota, legacy_ref
      ) values (
        coalesce(p_now, now()), p_actor, pid, bid, sub, lote, delta, queda,
        nullif(step->>'costo_unit', '')::numeric,
        tipo, nullif(step->>'doc_tipo', ''), doc, nullif(step->>'ticket_ref', ''),
        case when queda < -0.000001 and aprobado then p_actor else null end,
        nullif(step->>'nota', ''), legacy
      );
      if tipo = 'recepcion' and delta > 0 then
        select coalesce(sum(cantidad), 0) into antes from public.erp_stock where producto_id = pid;
        antes := antes - delta;
        select coalesce(costo_promedio, 0) into oldc from public.erp_productos where id = pid;
        costo := coalesce(nullif(step->>'costo_unit', '')::numeric, 0);
        den := antes + delta;
        if den > 0 then
          update public.erp_productos
            set costo_promedio = round((antes * oldc + delta * costo) / den, 4)
            where id = pid;
        end if;
      end if;
    else
      raise exception 'step op invalida: %', coalesce(op, '');
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'numero', numero_out);
end $$;

revoke all on function public.erp_tx(text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.erp_tx(text, text, jsonb, timestamptz) to service_role;
