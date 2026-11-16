-- APLICAR en el proyecto Supabase de Sunsu. Solo agrega: dos tablas nuevas, tres funciones nuevas y un trigger
-- de auditoría en esas tablas. No toca app_write, app_modulos, vistas ni datos existentes.
-- 0040: permisos por usuario al estilo MineCore (niveles 0-3 por módulo, interruptores costos/precios/saldos,
-- perfiles). Sin fila en app_usuario_permisos la persona queda exactamente como hoy (su rol + app_modulos).

create table if not exists public.app_usuario_permisos (
  uid text primary key,
  perfil text,
  niveles jsonb not null default '{}'::jsonb,
  alcance jsonb not null default '{}'::jsonb,
  flags jsonb not null default '{}'::jsonb,
  actualizado_por text,
  updated_at timestamptz not null default now()
);
alter table public.app_usuario_permisos enable row level security;
comment on table public.app_usuario_permisos is 'Permisos por usuario (beta). niveles {modulo:0..3} 0 nada·1 ver·2 crear/editar·3 aprobar/anular/borrar; alcance {modulo:propio|todos}; flags {costos,precios,saldos}. Sin fila = solo el rol. Se escribe con app_usuario_permiso_guardar.';

create table if not exists public.app_perfiles_permiso (
  id text primary key,
  nombre text not null,
  niveles jsonb not null default '{}'::jsonb,
  alcance jsonb not null default '{}'::jsonb,
  flags jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  actualizado_por text,
  updated_at timestamptz not null default now()
);
alter table public.app_perfiles_permiso enable row level security;
comment on table public.app_perfiles_permiso is 'Perfiles de permisos que un admin arma y aplica a una persona. Los perfiles «Como <rol>» no se guardan: salen de la matriz de roles.';

do $$
begin
  if exists (select 1 from pg_proc where proname = 'audit_trigger') then
    if not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = 'public.app_usuario_permisos'::regclass) then
      execute 'create trigger trg_audit after insert or update or delete on public.app_usuario_permisos for each row execute function public.audit_trigger(''uid'')';
    end if;
    if not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = 'public.app_perfiles_permiso'::regclass) then
      execute 'create trigger trg_audit after insert or update or delete on public.app_perfiles_permiso for each row execute function public.audit_trigger(''id'')';
    end if;
  end if;
end $$;

create or replace function public.app_usuario_permiso_guardar(
  p_uid text, p_perfil text, p_niveles jsonb, p_alcance jsonb, p_flags jsonb, p_actor text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rec jsonb;
begin
  if coalesce(btrim(p_actor), '') = '' then raise exception 'actor requerido'; end if;
  if coalesce(btrim(p_uid), '') = '' then raise exception 'uid requerido'; end if;
  perform set_config('app.user', p_actor, true);
  insert into public.app_usuario_permisos as t (uid, perfil, niveles, alcance, flags, actualizado_por, updated_at)
  values (p_uid, nullif(btrim(coalesce(p_perfil, '')), ''), coalesce(p_niveles, '{}'::jsonb), coalesce(p_alcance, '{}'::jsonb), coalesce(p_flags, '{}'::jsonb), p_actor, now())
  on conflict (uid) do update set perfil = excluded.perfil, niveles = excluded.niveles, alcance = excluded.alcance,
    flags = excluded.flags, actualizado_por = excluded.actualizado_por, updated_at = now()
  returning to_jsonb(t.*) into rec;
  return rec;
end $$;

create or replace function public.app_perfil_permiso_guardar(
  p_id text, p_nombre text, p_niveles jsonb, p_alcance jsonb, p_flags jsonb, p_activo boolean, p_actor text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rec jsonb;
begin
  if coalesce(btrim(p_actor), '') = '' then raise exception 'actor requerido'; end if;
  if coalesce(btrim(p_id), '') = '' or coalesce(btrim(p_nombre), '') = '' then raise exception 'id y nombre requeridos'; end if;
  perform set_config('app.user', p_actor, true);
  insert into public.app_perfiles_permiso as t (id, nombre, niveles, alcance, flags, activo, actualizado_por, updated_at)
  values (p_id, p_nombre, coalesce(p_niveles, '{}'::jsonb), coalesce(p_alcance, '{}'::jsonb), coalesce(p_flags, '{}'::jsonb), coalesce(p_activo, true), p_actor, now())
  on conflict (id) do update set nombre = excluded.nombre, niveles = excluded.niveles, alcance = excluded.alcance,
    flags = excluded.flags, activo = excluded.activo, actualizado_por = excluded.actualizado_por, updated_at = now()
  returning to_jsonb(t.*) into rec;
  return rec;
end $$;

create or replace function public.app_usuario_permiso_cambios(p_uid text)
returns setof public.audit_log
language sql stable security definer set search_path = public as $$
  select * from public.audit_log where tabla = 'app_usuario_permisos' and fila_id = p_uid order by ts desc limit 50;
$$;

revoke all on function public.app_usuario_permiso_guardar(text, text, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.app_perfil_permiso_guardar(text, text, jsonb, jsonb, jsonb, boolean, text) from public, anon, authenticated;
revoke all on function public.app_usuario_permiso_cambios(text) from public, anon, authenticated;
grant execute on function public.app_usuario_permiso_guardar(text, text, jsonb, jsonb, jsonb, text) to service_role;
grant execute on function public.app_perfil_permiso_guardar(text, text, jsonb, jsonb, jsonb, boolean, text) to service_role;
grant execute on function public.app_usuario_permiso_cambios(text) to service_role;
