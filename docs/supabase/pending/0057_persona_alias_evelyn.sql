-- 0057: alias de pantalla y nombre corto de Evelyn Toapanta.
-- SOLO AGREGA columnas, respaldo, alias y bitácora. No borra filas ni cambia el
-- campo nombre/patrón de matching (los tickets viejos siguen reconociendo a Evelyn).

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'cosmetologas_bak_20261118'
  ) then
    execute 'create table public.cosmetologas_bak_20261118 as table public.cosmetologas';
  end if;
end $$;

alter table public.cosmetologas add column if not exists nombre_mostrar text;
comment on column public.cosmetologas.nombre_mostrar is 'Nombre corto para pantalla. nombre y patron siguen usándose para reconocer a la persona.';

create table if not exists public.beta_persona_alias (
  patron text primary key,
  nombre_mostrar text not null,
  fuente text,
  created_at timestamptz not null default now()
);
comment on table public.beta_persona_alias is 'Alias de pantalla de personas (sin datos de contacto).';
alter table public.beta_persona_alias enable row level security;
grant select on public.beta_persona_alias to anon, authenticated, service_role;
grant insert, update, delete, references, trigger, truncate on public.beta_persona_alias to service_role;
drop policy if exists beta_persona_alias_select on public.beta_persona_alias;
create policy beta_persona_alias_select on public.beta_persona_alias
  for select to anon, authenticated, service_role using (true);

create table if not exists public.beta_persona_alias_log (
  id bigserial primary key,
  patron text,
  nombre_mostrar text,
  accion text not null,
  por text,
  created_at timestamptz not null default now()
);
comment on table public.beta_persona_alias_log is 'Bitácora de alias de pantalla. Sin cédulas ni teléfonos.';
alter table public.beta_persona_alias_log enable row level security;
grant select on public.beta_persona_alias_log to anon, authenticated, service_role;
grant insert, update, delete, references, trigger, truncate on public.beta_persona_alias_log to service_role;
drop policy if exists beta_persona_alias_log_select on public.beta_persona_alias_log;
create policy beta_persona_alias_log_select on public.beta_persona_alias_log
  for select to anon, authenticated, service_role using (true);

insert into public.beta_persona_alias (patron, nombre_mostrar, fuente) values
  ('evelyn anabel toapanta quishpe', 'Evelyn Toapanta', 'pedido Emilia 2026-11-18'),
  ('evelyn anabel toapanta quispe', 'Evelyn Toapanta', 'pedido Emilia 2026-11-18'),
  ('evelyn toapanta quishpe', 'Evelyn Toapanta', 'pedido Emilia 2026-11-18')
on conflict (patron) do update set nombre_mostrar = excluded.nombre_mostrar;

update public.cosmetologas
set nombre_mostrar = 'Evelyn Toapanta', updated_at = now()
where id = 'evelyn'
   or lower(nombre) like 'evelyn anabel toapanta%'
   or lower(nombre) = 'evelyn toapanta quishpe';

insert into public.beta_persona_alias_log (patron, nombre_mostrar, accion, por)
select 'evelyn anabel toapanta quishpe', 'Evelyn Toapanta', 'alta-0057', 'sql-0057'
where not exists (
  select 1 from public.beta_persona_alias_log where accion = 'alta-0057'
);
