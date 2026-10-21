-- 0009b_compat_0008.sql — incremental, idempotente. NO está en supabase/migrations.
-- Aplicar UNA vez, encima de 0008/0009/0010 ya desplegados:
--   supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0009b_compat_0008.sql
--
-- 0009 agregó rol/nombre a app_usuarios sin copiar role/name de 0008.
-- Las sesiones de 0007 apuntaban a usuarios. app_acceso leía app_modulos
-- sin ser security definer (con RLS devolvía 'no'). app_read queda
-- security invoker y solo service_role. El cambio de PIN del edge usa
-- crypt()/gen_salt('bf'), no el SHA-256 de la tabla usuarios.

-- ── rol/nombre desde role/name, solo si la columna origen existe y el destino está vacío ──
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_usuarios' and column_name = 'role'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_usuarios' and column_name = 'rol'
  ) then
    execute $u$
      update public.app_usuarios
         set rol = role
       where coalesce(btrim(rol), '') = ''
         and coalesce(btrim(role), '') <> ''
    $u$;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_usuarios' and column_name = 'name'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_usuarios' and column_name = 'nombre'
  ) then
    execute $u$
      update public.app_usuarios
         set nombre = name
       where coalesce(btrim(nombre), '') = ''
         and coalesce(btrim(name), '') <> ''
    $u$;
  end if;
end $$;

-- ── sesiones.uid apunta a app_usuarios. No se borra ninguna sesión. ──
do $$
declare
  id_type text;
  uid_type text;
  orphans int;
begin
  if to_regclass('public.sesiones') is null or to_regclass('public.app_usuarios') is null then
    return;
  end if;
  alter table public.sesiones drop constraint if exists sesiones_uid_fkey;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_usuarios' and column_name = 'usuario'
  ) then
    execute $q$
      update public.sesiones s
         set uid = u.id::text
        from public.app_usuarios u
       where s.uid is distinct from u.id::text
         and (s.uid = u.id::text or s.uid = u.usuario::text)
    $q$;
  else
    execute $q$
      update public.sesiones s
         set uid = u.id::text
        from public.app_usuarios u
       where s.uid is distinct from u.id::text
         and s.uid = u.id::text
    $q$;
  end if;

  select data_type into id_type from information_schema.columns
   where table_schema = 'public' and table_name = 'app_usuarios' and column_name = 'id';
  select data_type into uid_type from information_schema.columns
   where table_schema = 'public' and table_name = 'sesiones' and column_name = 'uid';
  comment on column public.sesiones.uid is
    'Identidad de app_usuarios (id). El login de producción no usa public.usuarios.';

  if id_type = 'text' and uid_type = 'text'
     and not exists (select 1 from pg_constraint where conname = 'sesiones_uid_app_usuarios_fkey') then
    select count(*) into orphans from public.sesiones s
     where not exists (select 1 from public.app_usuarios u where u.id = s.uid);
    if orphans = 0 then
      alter table public.sesiones
        add constraint sesiones_uid_app_usuarios_fkey
        foreign key (uid) references public.app_usuarios(id) on delete cascade;
    end if;
  end if;
end $$;

-- ── app_acceso lee app_modulos aunque el rol de la sesión no tenga policy sobre esa tabla ──
create or replace function public.app_acceso(p_modulo text) returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.app_es_admin() then 'todos'
    when p_modulo = 'permisos' then case when public.app_rol() = 'super_admin' then 'todos' else 'no' end
    when p_modulo = 'ver_costos' and public.app_rol() not in ('admin', 'super_admin') then 'no'
    else coalesce((select m.acceso from public.app_modulos m where m.rol = public.app_rol() and m.modulo = p_modulo), 'no')
  end;
$$;
revoke all on function public.app_acceso(text) from public, anon, authenticated;
grant execute on function public.app_acceso(text) to sunsu_rls, sunsu_admin, service_role;

-- ── app_read corre como quien llama (service_role) y solo ese rol puede ejecutarlo ──
create or replace function public.app_read(p_uid text, p_rol text, p_nombre text, p_tabla text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  cols text;
  rows jsonb;
  costo boolean;
begin
  if p_tabla !~ '^[a-z_][a-z0-9_]*$' then raise exception 'tabla invalida'; end if;
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = p_tabla) then
    raise exception 'tabla no existe';
  end if;
  perform set_config('app.uid', coalesce(p_uid, ''), true);
  perform set_config('app.rol', coalesce(p_rol, ''), true);
  perform set_config('app.nombre', coalesce(p_nombre, ''), true);
  perform set_config('app.user', coalesce(p_nombre, '') || ' (' || coalesce(p_uid, '') || ')', true);
  costo := p_rol in ('admin', 'super_admin', 'admin_master');
  select string_agg(quote_ident(c.column_name), ',') into cols
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = p_tabla
    and (costo or c.column_name not in ('precio_compra','utilidad','comi_producto_30','costo_promedio','costo_unit','costo_envase','costo_por_unidad','pin_hash','pin_salt'));
  execute 'set local role ' || case when costo then 'sunsu_admin' else 'sunsu_rls' end;
  execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from (select %s from public.%I) x', cols, p_tabla) into rows;
  execute 'reset role';
  return rows;
end $$;
revoke all on function public.app_read(text, text, text, text) from public, anon, authenticated;
grant execute on function public.app_read(text, text, text, text) to service_role;

-- ── PIN bcrypt. Solo service_role (el edge). No compara el hash en TypeScript. ──
create or replace function public.pin_coincide(p_id text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare h text;
begin
  select pin_hash into h from public.app_usuarios where id::text = p_id limit 1;
  if h is null or btrim(h) = '' or coalesce(btrim(p_pin), '') = '' then
    return false;
  end if;
  return h = crypt(p_pin, h);
end $$;

create or replace function public.pin_en_uso(p_pin text, p_excepto text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if coalesce(btrim(p_pin), '') = '' then return false; end if;
  return exists (
    select 1 from public.app_usuarios u
    where u.id::text is distinct from coalesce(p_excepto, '')
      and u.pin_hash is not null and btrim(u.pin_hash) <> ''
      and u.pin_hash = crypt(p_pin, u.pin_hash)
  );
end $$;

create or replace function public.hash_pin_bcrypt(p_pin text)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select crypt(p_pin, gen_salt('bf'));
$$;

revoke all on function public.pin_coincide(text, text) from public, anon, authenticated;
revoke all on function public.pin_en_uso(text, text) from public, anon, authenticated;
revoke all on function public.hash_pin_bcrypt(text) from public, anon, authenticated;
grant execute on function public.pin_coincide(text, text) to service_role;
grant execute on function public.pin_en_uso(text, text) to service_role;
grant execute on function public.hash_pin_bcrypt(text) to service_role;
