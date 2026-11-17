-- 0048: Detalle de ticket de la beta (Emilia 17/11, como la orden de venta de MineCore). SOLO AGREGA tablas
-- beta_* (no las toca el sync de la hoja) y amplía la lista de app_beta_write (función nuestra de 0045).
-- Por línea: cantidad, precio unitario (con IVA), descuento y total de línea. Por ticket: descuento (% o $),
-- promoción, exclusión de comisión. Nada se escribe en la tabla tickets ni en la hoja.

create table if not exists public.beta_tickets (
  clave text primary key,
  sheet_row integer,
  descuento_tipo text check (descuento_tipo in ('%','$')),
  descuento_valor numeric not null default 0,
  descuento_monto numeric not null default 0,
  promo_nombre text,
  promo_monto numeric not null default 0,
  excluir_cosmetologa boolean not null default false,
  excluir_nota text,
  lineas_beta boolean not null default false,
  historial jsonb not null default '[]'::jsonb,
  subtotal numeric, iva numeric, total numeric,
  actualizado_por text,
  updated_at timestamptz not null default now()
);
create table if not exists public.beta_ticket_lineas (
  id text primary key,
  ticket_clave text not null references public.beta_tickets(clave) on delete cascade,
  orden integer not null default 0,
  tipo text not null check (tipo in ('producto','facial','extra','paquete','gift','servicio')),
  sku text not null,
  nombre text,
  cantidad numeric not null check (cantidad > 0),
  precio_unit numeric not null default 0,
  descuento_tipo text check (descuento_tipo in ('%','$')),
  descuento_valor numeric not null default 0,
  descuento_monto numeric not null default 0,
  total_linea numeric not null default 0,
  excluir_comision boolean not null default false,
  estimado boolean not null default false
);
create index if not exists beta_tk_lineas_clave on public.beta_ticket_lineas (ticket_clave, orden);
alter table public.beta_tickets enable row level security;
alter table public.beta_ticket_lineas enable row level security;
comment on table public.beta_tickets is 'Detalle de ticket de la beta: descuentos, promo, exclusión de comisión y totales. Si lineas_beta, las líneas de beta_ticket_lineas mandan sobre las de la hoja.';

do $$
declare t text;
begin
  if exists (select 1 from pg_proc where proname = 'audit_trigger') then
    foreach t in array array['beta_ticket_lineas'] loop
      if not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = ('public.' || t)::regclass) then
        execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger(''id'')', t);
      end if;
    end loop;
    if not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = 'public.beta_tickets'::regclass) then
      execute 'create trigger trg_audit after insert or update or delete on public.beta_tickets for each row execute function public.audit_trigger(''clave'')';
    end if;
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.app_beta_write(p_actor text, p_table text, p_op text, p_match jsonb, p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  allowed text[] := array['beta_conteos','beta_conteo_lineas','beta_notificaciones','beta_transferencias','beta_transferencia_lineas','beta_ajustes','beta_ajuste_lineas','beta_stock','beta_stock_movimientos','beta_tickets','beta_ticket_lineas','beta_clientes','beta_cliente_notas'];
  col text; cols text[] := array[]::text[]; exprs text[] := array[]::text[];
  sets text[] := array[]::text[]; wh text[] := array[]::text[]; rec jsonb; q text;
begin
  if coalesce(btrim(p_actor), '') = '' then raise exception 'actor requerido'; end if;
  if p_table = 'beta_stock_movimientos' and p_op = 'delete' then
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
end $function$;

revoke all on function public.app_beta_write(text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.app_beta_write(text, text, text, jsonb, jsonb) to service_role;
