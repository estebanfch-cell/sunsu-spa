-- 0045: Conteo físico de la beta (Emilia 17/11, como MineCore). SOLO AGREGA: tablas beta_* nuevas,
-- una función de escritura nueva (app_beta_write, misma lógica que app_write pero solo para tablas
-- beta_* nuevas) y el trigger de auditoría. No toca app_write, erp_stock, cabina_inventario ni la hoja.
-- Aprobar un conteo NO mueve stock: queda como "inventario físico inicial" (stock_aplicado = false)
-- hasta que Emilia confirme.

create table if not exists public.beta_conteos (
  id text primary key,
  numero text not null unique,
  bodega text not null check (bodega in ('CONSIGNACION','CABINA','OFICINA')),
  sububicacion text,
  familias text,
  asignado_a text,
  asignado_nombre text,
  estado text not null default 'asignado' check (estado in ('asignado','en_conteo','en_revision','aprobado','cancelado')),
  nota text,
  revision_nota text,
  creado_por text,
  creado_at timestamptz not null default now(),
  iniciado_at timestamptz, iniciado_por text,
  enviado_at timestamptz, enviado_por text,
  aprobado_at timestamptz, aprobado_por text,
  cancelado_at timestamptz, cancelado_por text,
  stock_aplicado boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.beta_conteo_lineas (
  id text primary key,
  conteo_id text not null references public.beta_conteos(id) on delete cascade,
  orden integer not null default 0,
  producto_id text,
  sku text not null,
  nombre text,
  sububicacion text,
  sistema numeric not null default 0,
  contado numeric,
  estado text not null default 'pendiente' check (estado in ('pendiente','contado','no_encontrado')),
  sub_contada text,
  agregado boolean not null default false,
  nota text,
  contado_por text,
  contado_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists beta_conteo_lineas_conteo on public.beta_conteo_lineas (conteo_id, orden);
create table if not exists public.beta_notificaciones (
  id text primary key,
  usuario text not null,
  tipo text not null,
  titulo text not null,
  cuerpo text,
  link text,
  ref_id text,
  leida_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists beta_notificaciones_usuario on public.beta_notificaciones (usuario, leida_at);
alter table public.beta_conteos enable row level security;
alter table public.beta_conteo_lineas enable row level security;
alter table public.beta_notificaciones enable row level security;
comment on table public.beta_conteos is 'Conteo físico de la beta por bodega (Consignación / Bodega Cabina [Cabina 1/2/3] / Oficina), asignado a una usuaria. asignado → en_conteo → en_revision → aprobado. Aprobar no mueve stock (stock_aplicado=false).';
comment on table public.beta_conteo_lineas is 'Líneas del conteo: stock del sistema al empezar (sistema), lo contado, estado y la sububicación real si cambió.';
comment on table public.beta_notificaciones is 'Avisos dentro de la app (ej. conteo asignado). leida_at null = sin leer.';

do $$
declare t text;
begin
  if exists (select 1 from pg_proc where proname = 'audit_trigger') then
    foreach t in array array['beta_conteos','beta_conteo_lineas'] loop
      if not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = ('public.' || t)::regclass) then
        execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger(''id'')', t);
      end if;
    end loop;
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.app_beta_write(p_actor text, p_table text, p_op text, p_match jsonb, p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  allowed text[] := array['beta_conteos','beta_conteo_lineas','beta_notificaciones','beta_transferencias','beta_transferencia_lineas','beta_ajustes','beta_ajuste_lineas','beta_stock','beta_stock_movimientos'];
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
