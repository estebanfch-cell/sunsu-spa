-- COPIA de referencia. YA APLICADA en el proyecto Supabase.
-- No poner este archivo en supabase/migrations (se re-aplicaría).

-- 0006: bitácora de auditoría genérica (quién, cuándo, tabla, fila, acción, antes/después). No destructivo.
create table if not exists public.audit_log (
  id bigserial primary key,
  ts timestamptz not null default now(),
  actor text not null,            -- usuario del app / auth.uid() / rol de BD
  actor_fuente text not null,     -- 'auth' | 'jwt' | 'app.user' | 'db'
  tabla text not null, fila_id text, accion text not null check (accion in ('INSERT','UPDATE','DELETE')),
  antes jsonb, despues jsonb, cambios jsonb);
create index if not exists audit_log_tabla_fila_idx on public.audit_log (tabla, fila_id);
create index if not exists audit_log_ts_idx on public.audit_log (ts desc);
alter table public.audit_log enable row level security;
revoke update, delete on public.audit_log from anon, authenticated;

-- Identidad: 1) auth.uid() 2) claim app_user / email / sub del JWT 3) set_config('app.user', ...) 4) rol de BD
create or replace function public.audit_actor(out actor text, out fuente text) language plpgsql stable as $$
declare cl jsonb; begin
  begin actor := auth.uid()::text; exception when others then actor := null; end;
  if actor is not null then fuente := 'auth';
    begin cl := nullif(current_setting('request.jwt.claims', true),'')::jsonb; exception when others then cl := null; end;
    if cl ? 'app_user' then actor := (cl->>'app_user')||' ('||actor||')'; end if; return; end if;
  begin cl := nullif(current_setting('request.jwt.claims', true),'')::jsonb; exception when others then cl := null; end;
  actor := coalesce(cl->>'app_user', cl->>'email', nullif(cl->>'sub',''));
  if actor is not null then fuente := 'jwt'; return; end if;
  actor := nullif(current_setting('app.user', true),'');
  if actor is not null then fuente := 'app.user'; return; end if;
  actor := coalesce(cl->>'role', current_user); fuente := 'db';
end $$;

create or replace function public.audit_trigger() returns trigger language plpgsql security definer set search_path = public as $$
declare a record; o jsonb; n jsonb; d jsonb;
begin
  select * into a from public.audit_actor();
  if tg_op in ('UPDATE','DELETE') then o := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then n := to_jsonb(new); end if;
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_object('antes', o->k, 'despues', n->k)) into d
    from jsonb_object_keys(n) k where k <> 'updated_at' and (o->k) is distinct from (n->k);
    if d is null then return new; end if;   -- upsert sin cambios reales: no se registra
  end if;
  insert into public.audit_log(actor, actor_fuente, tabla, fila_id, accion, antes, despues, cambios)
  values (a.actor, a.fuente, tg_table_name, (select string_agg(coalesce(n,o)->>c, '|') from unnest(tg_argv) c),
          tg_op, o, n, d);
  return coalesce(new, old);
end $$;

-- Conectar a TODAS las tablas de public (menos audit_log). Re-ejecutable para tablas nuevas.
create or replace function public.audit_attach_all() returns int language plpgsql as $$
declare t text; pk text; k int := 0; begin
  for t in select tablename from pg_tables where schemaname='public' and tablename <> 'audit_log' loop
    select string_agg(quote_literal(a.attname), ',' order by array_position(i.indkey, a.attnum)) into pk
      from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = format('public.%I',t)::regclass and i.indisprimary;
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger(%s)', t, coalesce(pk,''));
    k := k + 1; end loop; return k; end $$;
select public.audit_attach_all() as tablas_auditadas;
