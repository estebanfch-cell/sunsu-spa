-- APLICAR en el proyecto Supabase de Sunsu. Solo agrega: una tabla nueva, dos funciones nuevas y el
-- trigger de auditoría. No toca cabina_protocolos ni cabina_protocolo_pasos (la hoja los sigue
-- sincronizando cada hora); la beta edita su propia copia.
-- 0042: Protocolos editables en la beta. Se siembra UNA vez copiando cabina_protocolos y sus pasos
-- (la última versión de pasos de cada facial). Si se vuelve a correr no pisa lo editado.

create table if not exists public.beta_protocolos (
  id text primary key,
  sku text not null,
  nombre text not null,
  version integer not null default 1,
  vigente boolean not null default true,
  mano_de_obra numeric,
  notas text,
  pasos jsonb not null default '[]'::jsonb,
  origen text not null default 'beta',
  origen_version integer,
  actualizado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  borrado_at timestamptz
);
create unique index if not exists beta_protocolos_sku_vivo on public.beta_protocolos (upper(sku)) where borrado_at is null;
alter table public.beta_protocolos enable row level security;
comment on table public.beta_protocolos is 'Protocolos de la beta (receta de cada facial). pasos = [{paso, descripcion, producto_cod, cantidad, unidad, minutos}] en orden. Sembrado desde cabina_protocolos; la hoja ya no los pisa. Se escribe con app_protocolo_guardar.';

do $$
begin
  if exists (select 1 from pg_proc where proname = 'audit_trigger') then
    if not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = 'public.beta_protocolos'::regclass) then
      execute 'create trigger trg_audit after insert or update or delete on public.beta_protocolos for each row execute function public.audit_trigger(''id'')';
    end if;
  end if;
end $$;

-- Semilla: una fila por facial de cabina_protocolos, con los pasos de su última versión.
insert into public.beta_protocolos (id, sku, nombre, version, vigente, mano_de_obra, notas, pasos, origen, origen_version, actualizado_por)
select
  'pr-' || lower(regexp_replace(upper(btrim(p.sku)), '[^A-Z0-9]+', '-', 'g')),
  upper(btrim(p.sku)),
  coalesce(nullif(btrim(p.facial), ''), upper(btrim(p.sku))),
  1,
  upper(coalesce(p.vigente::text, 'SI')) in ('SI', 'SÍ', 'TRUE', 'T', '1'),
  p.mano_de_obra::numeric,
  p.notas,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'paso', x.n, 'descripcion', coalesce(x.descripcion, ''), 'producto_cod', coalesce(upper(btrim(x.producto_cod)), ''),
      'cantidad', coalesce(x.cantidad::numeric, 0), 'unidad', coalesce(x.unidad, ''), 'minutos', coalesce(x.minutos::numeric, 0)
    ) order by x.n)
    from (
      select s.*, row_number() over (order by s.paso, s.id) as n
      from public.cabina_protocolo_pasos s
      where upper(btrim(s.sku)) = upper(btrim(p.sku))
        and coalesce(s.version::numeric, 1) = (select max(coalesce(z.version::numeric, 1)) from public.cabina_protocolo_pasos z where upper(btrim(z.sku)) = upper(btrim(p.sku)))
    ) x
  ), '[]'::jsonb),
  'cabina',
  p.version::integer,
  'semilla 0042'
from (select distinct on (upper(btrim(c.sku))) c.* from public.cabina_protocolos c where coalesce(btrim(c.sku), '') <> '' order by upper(btrim(c.sku)), c.version desc nulls last, c.id desc) p
where coalesce(btrim(p.sku), '') <> ''
  and not exists (select 1 from public.beta_protocolos b where upper(b.sku) = upper(btrim(p.sku)))
on conflict (id) do nothing;

create or replace function public.app_protocolo_guardar(p_id text, p_row jsonb, p_actor text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare rec jsonb;
begin
  if coalesce(btrim(p_actor), '') = '' then raise exception 'actor requerido'; end if;
  if coalesce(btrim(p_id), '') = '' then raise exception 'id requerido'; end if;
  perform set_config('app.user', p_actor, true);
  insert into public.beta_protocolos as t (id, sku, nombre, version, vigente, mano_de_obra, notas, pasos, origen, actualizado_por, updated_at, borrado_at)
  values (
    p_id, upper(btrim(p_row->>'sku')), btrim(p_row->>'nombre'), coalesce((p_row->>'version')::integer, 1),
    coalesce((p_row->>'vigente')::boolean, true), nullif(p_row->>'mano_de_obra', '')::numeric, p_row->>'notas',
    coalesce(p_row->'pasos', '[]'::jsonb), coalesce(p_row->>'origen', 'beta'), p_actor, now(),
    case when coalesce((p_row->>'borrar')::boolean, false) then now() else null end
  )
  on conflict (id) do update set sku = excluded.sku, nombre = excluded.nombre, version = t.version + 1,
    vigente = excluded.vigente, mano_de_obra = excluded.mano_de_obra, notas = excluded.notas, pasos = excluded.pasos,
    actualizado_por = excluded.actualizado_por, updated_at = now(), borrado_at = excluded.borrado_at
  returning to_jsonb(t.*) into rec;
  return rec;
end $$;

create or replace function public.app_protocolo_cambios(p_id text)
returns setof public.audit_log
language sql stable security definer set search_path = public as $$
  select * from public.audit_log where tabla = 'beta_protocolos' and fila_id = p_id order by ts desc limit 50;
$$;

revoke all on function public.app_protocolo_guardar(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.app_protocolo_cambios(text) from public, anon, authenticated;
grant execute on function public.app_protocolo_guardar(text, jsonb, text) to service_role;
grant execute on function public.app_protocolo_cambios(text) to service_role;
