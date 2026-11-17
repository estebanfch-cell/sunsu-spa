-- Cada registro del QR (clientas_registro, venga de la hoja o de la beta) crea/actualiza su clienta en beta_clientes
-- con un código único C-xxxxx. Sin duplicados: misma cédula = misma clienta; sin cédula, mismo celular.
-- Aditivo: columnas nuevas + trigger nuevo; si algo falla, el registro igual se guarda.
alter table public.beta_clientes add column if not exists codigo text;
alter table public.beta_clientes add column if not exists cedula text;
alter table public.beta_clientes add column if not exists telefono text;
alter table public.beta_clientes add column if not exists nombre text;
alter table public.beta_clientes add column if not exists origen text;
alter table public.beta_clientes add column if not exists created_at timestamptz default now();
create unique index if not exists beta_clientes_codigo_uq on public.beta_clientes (codigo) where codigo is not null;
create index if not exists beta_clientes_cedula_ix on public.beta_clientes (cedula);
create index if not exists beta_clientes_tel_ix on public.beta_clientes (telefono);

create or replace function public.beta_ced_norm(v text) returns text language sql immutable as $$
  select nullif(ltrim(regexp_replace(split_part(coalesce(v,''), '.', 1), '[^0-9]', '', 'g'), '0'), '')
$$;
-- 9 dígitos del celular (sin 593 / 0 inicial / .0), o null.
create or replace function public.beta_tel_norm(v text) returns text language sql immutable as $$
  select case when length(d) >= 9 then right(d, 9) else null end
  from (select ltrim(regexp_replace(regexp_replace(regexp_replace(coalesce(v,''), '\.0+$', ''), '[^0-9]', '', 'g'), '^593', ''), '0') d) x
$$;

create or replace function public.beta_cliente_desde_registro(r public.clientas_registro) returns text
language plpgsql security definer set search_path to 'public' as $$
declare ced text := public.beta_ced_norm(r.cedula::text); tel text := public.beta_tel_norm(r.telefono::text);
  k text; cod text; ex record; n int;
begin
  if r.borrado_at is not null then return null; end if;
  if ced is null and tel is null then return null; end if;
  if ced is not null then select * into ex from public.beta_clientes where cedula = ced or key = 'c:' || ced limit 1;
  else select * into ex from public.beta_clientes where telefono = tel limit 1; end if;
  if found then
    update public.beta_clientes set
      cedula = coalesce(cedula, ced), telefono = coalesce(telefono, tel),
      nombre = coalesce(nullif(nombre, ''), nullif(btrim(coalesce(r.nombre,'') || ' ' || coalesce(r.apellido,'')), '')),
      codigo = coalesce(codigo, case when r.sheet_row > 1 then 'C-' || lpad((r.sheet_row - 1)::text, 5, '0') end)
    where key = ex.key;
    return ex.key;
  end if;
  k := case when ced is not null then 'c:' || ced else 't:' || tel end;
  if r.sheet_row > 1 then cod := 'C-' || lpad((r.sheet_row - 1)::text, 5, '0');
  else
    perform pg_advisory_xact_lock(hashtext('beta_clientes_codigo'));
    select coalesce(max(substring(codigo from '^C-B(\d+)$')::int), 0) + 1 into n from public.beta_clientes;
    cod := 'C-B' || lpad(n::text, 5, '0');
  end if;
  if exists (select 1 from public.beta_clientes where codigo = cod) then cod := null; end if;
  insert into public.beta_clientes (key, datos, historial, codigo, cedula, telefono, nombre, origen, actualizado_por, updated_at, created_at)
  values (k, '{}'::jsonb, jsonb_build_array(jsonb_build_object('fecha', now(), 'por', 'registro QR', 'accion', 'alta automática')), cod, ced, tel,
          nullif(btrim(coalesce(r.nombre,'') || ' ' || coalesce(r.apellido,'')), ''), 'registro', 'registro QR', now(), now())
  on conflict (key) do nothing;
  return k;
end $$;

create or replace function public.trg_beta_cliente_registro() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  begin perform public.beta_cliente_desde_registro(new); exception when others then null; end;
  return new;
end $$;
drop trigger if exists zzz_beta_cliente_registro on public.clientas_registro;
create trigger zzz_beta_cliente_registro after insert or update on public.clientas_registro
  for each row execute function public.trg_beta_cliente_registro();

-- Alta de las que ya están registradas (la primera fila de cada cédula da el código, igual que hoy).
do $$ declare r public.clientas_registro; begin
  for r in select * from public.clientas_registro where borrado_at is null order by sheet_row nulls last loop
    begin perform public.beta_cliente_desde_registro(r); exception when others then null; end;
  end loop;
end $$;
