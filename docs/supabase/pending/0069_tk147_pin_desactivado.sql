-- TK147: desactivar el PIN solo en quienes ya tienen usuario + contraseña propios.
-- Idempotente. NUNCA imprime ni registra PINs, hashes ni contraseñas.
-- Backup obligatorio ANTES de alterar:
--   _bak_20261119_tk147_pins  (app_usuarios + usuarios, con hashes conservados)

create table if not exists public._bak_20261119_tk147_pins as
select 'app_usuarios'::text as _src, to_jsonb(u) as fila, now() as bak_at
from public.app_usuarios u
where false;

-- Re-cargar el respaldo solo si está vacío (no pisar un backup anterior).
insert into public._bak_20261119_tk147_pins (_src, fila, bak_at)
select 'app_usuarios', to_jsonb(u), now()
from public.app_usuarios u
where not exists (select 1 from public._bak_20261119_tk147_pins limit 1);

insert into public._bak_20261119_tk147_pins (_src, fila, bak_at)
select 'usuarios', to_jsonb(u), now()
from public.usuarios u
where not exists (select 1 from public._bak_20261119_tk147_pins where _src = 'usuarios' limit 1);

alter table public.app_usuarios add column if not exists pin_desactivado boolean not null default false;
alter table public.usuarios add column if not exists pin_desactivado boolean not null default false;

comment on column public.app_usuarios.pin_desactivado is
  'TK147: true cuando la persona ya tiene usuario+contraseña. El PIN deja de aceptar login; se puede reactivar si un admin quita el usuario.';
comment on column public.usuarios.pin_desactivado is
  'TK147: igual que app_usuarios.pin_desactivado (tabla legado).';

-- Solo quienes ya tienen contraseña propia (no temporal pendiente de cambio).
update public.app_usuarios a
   set pin_desactivado = true
 where a.pin_desactivado is distinct from true
   and exists (
     select 1 from public.beta_credenciales c
      where c.usuario_id = a.id
        and c.pass_hash is not null
        and length(c.pass_hash) > 0
        and coalesce(c.debe_cambiar_pass, false) = false
   );

update public.usuarios u
   set pin_desactivado = true
 where u.pin_desactivado is distinct from true
   and exists (
     select 1 from public.beta_credenciales c
      where c.usuario_id = u.id
        and c.pass_hash is not null
        and length(c.pass_hash) > 0
        and coalesce(c.debe_cambiar_pass, false) = false
   );

-- login_pin: misma lógica en vivo, más el rechazo si el PIN está desactivado.
create or replace function public.login_pin(p_pin text, p_ip text default ''::text)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v jsonb;
  n int;
  uid text;
  intentos int;
  hasta timestamptz;
  desact boolean;
begin
  if coalesce(btrim(p_pin), '') = '' then
    return jsonb_build_object('error', 'Falta el PIN');
  end if;
  select count(*) into n from public.login_intentos
   where ip = coalesce(p_ip, '') and ts > now() - interval '15 minutes';
  if coalesce(p_ip, '') <> '' and n >= 8 then
    return jsonb_build_object('error', 'Demasiados intentos. Espera 15 minutos.');
  end if;
  begin
    execute 'select to_jsonb(r) from public.verificar_pin($1) r' into v using p_pin;
  exception when others then
    begin
      execute 'select public.verificar_pin($1)::jsonb' into v using p_pin;
    exception when others then
      return jsonb_build_object('error', 'No se pudo verificar el PIN');
    end;
  end;
  if v is null or v = 'null'::jsonb or v = '{}'::jsonb
     or coalesce(v->>'ok', 'true') = 'false' then
    insert into public.login_intentos(ip, ts) values (coalesce(p_ip, ''), now());
    uid := nullif(v->>'id', '');
    if uid is not null then
      execute 'update public.app_usuarios set intentos_fallidos = coalesce(intentos_fallidos,0) + 1 where id::text = $1' using uid;
      execute 'select intentos_fallidos from public.app_usuarios where id::text = $1' into intentos using uid;
      if coalesce(intentos, 0) >= 5 then
        execute 'update public.app_usuarios set bloqueado_hasta = now() + interval ''15 minutes'' where id::text = $1' using uid;
      end if;
    end if;
    return jsonb_build_object('error', 'PIN incorrecto');
  end if;
  if v ? 'user' then v := v->'user'; end if;
  uid := coalesce(v->>'id', v->>'usuario');
  if uid is not null then
    execute 'select bloqueado_hasta from public.app_usuarios where id::text = $1' into hasta using uid;
    if hasta is not null and hasta > now() then
      return jsonb_build_object('error', 'Demasiados intentos. Espera unos minutos.');
    end if;
    desact := false;
    begin
      execute 'select coalesce(pin_desactivado, false) from public.app_usuarios where id::text = $1' into desact using uid;
    exception when undefined_column then
      desact := false;
    end;
    if coalesce(desact, false) then
      return jsonb_build_object('error', 'Este PIN ya no está activo. Entra con tu usuario y contraseña.');
    end if;
    execute 'update public.app_usuarios set intentos_fallidos = 0, bloqueado_hasta = null where id::text = $1' using uid;
  end if;
  return jsonb_build_object('ok', true, 'user', v);
end;
$$;

revoke all on function public.login_pin(text, text) from public, anon, authenticated;
grant execute on function public.login_pin(text, text) to service_role;

-- ── Correo y reseteo de contraseña (TK147, t643u) ──
alter table public.beta_credenciales add column if not exists email text;
create unique index if not exists beta_credenciales_email_unico
  on public.beta_credenciales (lower(email))
  where email is not null and length(btrim(email)) > 0;

create table if not exists public.beta_password_resets (
  id bigserial primary key,
  usuario_id text not null,
  token_hash text not null unique,
  exp timestamptz not null,
  used_at timestamptz,
  creado_por text,
  created_at timestamptz not null default now()
);
alter table public.beta_password_resets enable row level security;
create index if not exists beta_password_resets_usuario_idx on public.beta_password_resets (usuario_id, exp desc);
comment on table public.beta_password_resets is
  'TK147: tokens de reseteo de contraseña. Solo se guarda el hash (SHA-256); el valor en claro nunca se almacena.';
