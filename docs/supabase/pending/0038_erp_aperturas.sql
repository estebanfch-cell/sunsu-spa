-- Aperturas de Cabina con destino. Aditiva: tabla nueva, no borra filas ni reordena columnas.
-- 0037 es el último número de este repo. 0036 está usado en producción y no está aquí:
-- este archivo NO reemplaza app_write, para no recortar el allowlist vivo.
-- No se aplica solo. El dueño lo corre después de aprobar:
--   supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0038_erp_aperturas.sql
--
-- Cabina sigue siendo UNA bodega (22222222-2222-4222-8222-222222222222).
-- CABINA_1, CABINA_2, CABINA_3 y LOCAL son sububicaciones del envase abierto.
--
-- Sync (docs/supabase/tools/import.py): el importador ya copia cada encabezado a
-- cabina_aperturas.orig. La columna DESTINO, al final de 🍾 APERTURAS, entra en orig
-- sin mover las columnas tipadas (van por índice en schema.json, que no está en el repo).
-- No hace falta editar import.py. El trigger de abajo pasa a erp_aperturas las filas
-- que traen destino. Las filas viejas, sin destino, se quedan vacías: no se les inventa uno.
-- Si el trigger falla, la fila del espejo igual se guarda.

create table if not exists public.erp_aperturas (
  id bigserial primary key,
  producto_id uuid references public.erp_productos(id),
  bodega_id uuid references public.erp_bodegas(id),
  destino text not null check (destino in ('CABINA_1','CABINA_2','CABINA_3','LOCAL')),
  tipo text not null check (tipo in ('ABRIR','TERMINADO')),
  usuario text not null default '',
  created_at timestamptz not null default now(),
  origen text not null default 'beta' check (origen in ('sheet','beta')),
  sheet_ref text
);

comment on table public.erp_aperturas is
  'Apertura o terminado de un envase en la bodega Cabina. destino es la sububicación (CABINA_1, CABINA_2, CABINA_3, LOCAL).';
comment on column public.erp_aperturas.bodega_id is
  'Siempre la bodega Cabina. Las cuatro salas no son bodegas nuevas.';
comment on column public.erp_aperturas.sheet_ref is
  'Número AP-### de la hoja 🍾 APERTURAS, o fila-N si la hoja no trae NUM.';
comment on column public.erp_aperturas.origen is
  'sheet = la copió el sync. beta = la anotó la función api.';

create unique index if not exists erp_aperturas_sheet_ref_uidx
  on public.erp_aperturas (sheet_ref)
  where sheet_ref is not null and sheet_ref <> '';

create index if not exists erp_aperturas_producto_idx
  on public.erp_aperturas (producto_id, created_at);

alter table public.erp_aperturas enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sunsu_rls') then
    execute 'grant select, insert, update, delete on public.erp_aperturas to sunsu_rls';
    execute 'grant usage, select on sequence public.erp_aperturas_id_seq to sunsu_rls';
  end if;
  if exists (select 1 from pg_roles where rolname = 'sunsu_admin') then
    execute 'grant select, insert, update, delete on public.erp_aperturas to sunsu_admin';
    execute 'grant usage, select on sequence public.erp_aperturas_id_seq to sunsu_admin';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.erp_aperturas to service_role';
    execute 'grant usage, select on sequence public.erp_aperturas_id_seq to service_role';
  end if;
end $$;

create or replace function public.erp_sin_acento(p text) returns text
language sql immutable as $$
  select translate(coalesce(p, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun');
$$;

create or replace function public.erp_norm_destino(p text) returns text
language sql immutable as $$
  select case upper(regexp_replace(public.erp_sin_acento(btrim(coalesce(p, ''))), '[^A-Za-z0-9]+', '_', 'g'))
    when 'CABINA_1' then 'CABINA_1'
    when 'CABINA1' then 'CABINA_1'
    when 'C1' then 'CABINA_1'
    when 'CABINA_2' then 'CABINA_2'
    when 'CABINA2' then 'CABINA_2'
    when 'C2' then 'CABINA_2'
    when 'CABINA_3' then 'CABINA_3'
    when 'CABINA3' then 'CABINA_3'
    when 'C3' then 'CABINA_3'
    when 'LOCAL' then 'LOCAL'
    when 'GENERAL' then 'LOCAL'
    else null
  end;
$$;

create or replace function public.erp_producto_de_cabina(p_cod text) returns uuid
language plpgsql stable as $$
declare
  pid uuid;
  clave text := upper(regexp_replace(coalesce(p_cod, ''), '^SUNSU-', ''));
begin
  if clave = '' or to_regclass('public.erp_productos') is null then
    return null;
  end if;
  select id into pid from public.erp_productos
   where upper(regexp_replace(sku, '^SUNSU-', '')) = clave
   limit 1;
  if pid is not null or to_regclass('public.cabina_inventario') is null then
    return pid;
  end if;
  select p.id into pid
    from public.cabina_inventario c
    join public.erp_productos p
      on upper(regexp_replace(p.sku, '^SUNSU-', ''))
       = upper(regexp_replace(coalesce(c.sku_catalogo, ''), '^SUNSU-', ''))
   where c.codigo = p_cod
     and coalesce(c.sku_catalogo, '') <> ''
   limit 1;
  return pid;
end $$;

-- La beta anota aquí. No pasa por app_write.
create or replace function public.erp_apertura_anotar(
  p_producto_id uuid,
  p_bodega_id uuid,
  p_destino text,
  p_tipo text,
  p_usuario text,
  p_origen text,
  p_sheet_ref text,
  p_created_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.erp_aperturas;
  dest text := public.erp_norm_destino(p_destino);
begin
  if dest is null then
    raise exception 'destino invalido';
  end if;
  if p_tipo not in ('ABRIR', 'TERMINADO') then
    raise exception 'tipo invalido';
  end if;
  if coalesce(p_origen, 'beta') not in ('sheet', 'beta') then
    raise exception 'origen invalido';
  end if;
  insert into public.erp_aperturas (producto_id, bodega_id, destino, tipo, usuario, created_at, origen, sheet_ref)
  values (
    p_producto_id,
    p_bodega_id,
    dest,
    p_tipo,
    coalesce(p_usuario, ''),
    coalesce(p_created_at, now()),
    coalesce(p_origen, 'beta'),
    nullif(btrim(coalesce(p_sheet_ref, '')), '')
  )
  on conflict (sheet_ref) where sheet_ref is not null and sheet_ref <> ''
  do update set
    destino = excluded.destino,
    tipo = excluded.tipo,
    usuario = excluded.usuario,
    producto_id = coalesce(public.erp_aperturas.producto_id, excluded.producto_id),
    bodega_id = coalesce(public.erp_aperturas.bodega_id, excluded.bodega_id)
  where public.erp_aperturas.origen = 'sheet'
  returning * into rec;
  if not found then
    select * into rec from public.erp_aperturas
     where sheet_ref = nullif(btrim(coalesce(p_sheet_ref, '')), '')
     limit 1;
  end if;
  return to_jsonb(rec);
end $$;

revoke all on function public.erp_apertura_anotar(uuid, uuid, text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.erp_apertura_anotar(uuid, uuid, text, text, text, text, text, timestamptz) to service_role;

create or replace function public.erp_aperturas_desde_hoja() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o jsonb := coalesce(new.orig, '{}'::jsonb);
  dest text;
  acc text;
  tipo text;
  ref text;
  cod text;
  quien text;
  pid uuid;
  bid uuid;
  cuando timestamptz;
begin
  dest := public.erp_norm_destino(coalesce(o->>'DESTINO', o->>'destino', ''));
  if dest is null then
    return new;
  end if;
  acc := upper(public.erp_sin_acento(coalesce(o->>'ACCIÓN', o->>'ACCION', o->>'accion', '')));
  if acc like '%APERT%' or acc = 'ABRIR' then
    tipo := 'ABRIR';
  elsif acc like '%ACAB%' or acc like '%TERMIN%' then
    tipo := 'TERMINADO';
  else
    return new;
  end if;
  ref := nullif(btrim(coalesce(o->>'NUM', o->>'num', '')), '');
  if ref is null then
    ref := 'fila-' || new.sheet_row::text;
  end if;
  cod := btrim(coalesce(o->>'CÓDIGO', o->>'CODIGO', o->>'codigo', new.producto, ''));
  quien := btrim(coalesce(o->>'POR', o->>'por', new.quien, ''));
  pid := public.erp_producto_de_cabina(cod);
  select id into bid from public.erp_bodegas
   where id = '22222222-2222-4222-8222-222222222222' or codigo = 'CABINA'
   order by case when id = '22222222-2222-4222-8222-222222222222' then 0 else 1 end
   limit 1;
  begin
    cuando := to_timestamp(btrim(coalesce(o->>'FECHA', o->>'fecha', '')), 'DD/MM/YYYY HH24:MI');
  exception when others then
    cuando := null;
  end;
  if cuando is null then
    cuando := coalesce(new.created_at, now());
  end if;
  insert into public.erp_aperturas (producto_id, bodega_id, destino, tipo, usuario, created_at, origen, sheet_ref)
  values (pid, bid, dest, tipo, quien, cuando, 'sheet', ref)
  on conflict (sheet_ref) where sheet_ref is not null and sheet_ref <> ''
  do update set
    destino = excluded.destino,
    tipo = excluded.tipo,
    usuario = excluded.usuario,
    producto_id = coalesce(public.erp_aperturas.producto_id, excluded.producto_id),
    bodega_id = coalesce(public.erp_aperturas.bodega_id, excluded.bodega_id),
    created_at = excluded.created_at
  where public.erp_aperturas.origen = 'sheet';
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists trg_cabina_aperturas_erp on public.cabina_aperturas;
create trigger trg_cabina_aperturas_erp
  after insert or update on public.cabina_aperturas
  for each row execute function public.erp_aperturas_desde_hoja();
