-- Código PQ-0001… para cada paquete vendido (Emilia 17/11). Aditivo: columna propia de la beta
-- (el sync por hoja no la manda, así que no la pisa), índice único y trigger que la llena una sola vez.
-- Los paquetes viejos conservan su PACK-### (de la importación); los que quedaron sin código y los nuevos
-- reciben PQ-####. El PACK-#### de 4+ dígitos que pone zz_paquetes_codigo en cada upsert no cuenta.
alter table public.paquetes add column if not exists beta_codigo text;
create unique index if not exists paquetes_beta_codigo_uq on public.paquetes (beta_codigo) where beta_codigo is not null;

create or replace function public.beta_paquetes_codigo_pq() returns trigger language plpgsql as $$
declare nx int;
begin
  if coalesce(new.beta_codigo, '') <> '' then return new; end if;
  if coalesce(new.sku, '') = '' or (coalesce(new.nombres, '') = '' and coalesce(new.cedula, '') = '') then return new; end if;
  if coalesce(new.origin, '') = 'test' or new.borrado_at is not null then return new; end if;
  if coalesce(new.codigo, '') ~ '^PACK-\d{1,3}$' then return new; end if;
  if tg_op = 'INSERT' and new.sheet_row is not null and exists (select 1 from public.paquetes where sheet_row = new.sheet_row) then
    return new; -- upsert del sync: lo resuelve el BEFORE UPDATE del mismo upsert
  end if;
  perform pg_advisory_xact_lock(hashtext('beta_paquetes_codigo_pq'));
  select coalesce(max(substring(beta_codigo from 4)::int), 0) + 1 into nx from public.paquetes where beta_codigo ~ '^PQ-\d+$';
  new.beta_codigo := 'PQ-' || lpad(nx::text, 4, '0');
  return new;
exception when others then
  return new; -- nunca romper el sync por el código
end $$;

drop trigger if exists zzz_paquetes_beta_codigo on public.paquetes;
create trigger zzz_paquetes_beta_codigo before insert or update on public.paquetes
  for each row execute function public.beta_paquetes_codigo_pq();

-- Relleno: los vendidos que no tienen código (desde el 29/10 el sync ya no los numeraba), por orden de hoja.
do $$
declare r record; nx int;
begin
  select coalesce(max(substring(beta_codigo from 4)::int), 0) into nx from public.paquetes where beta_codigo ~ '^PQ-\d+$';
  for r in select id from public.paquetes
    where coalesce(beta_codigo, '') = '' and coalesce(sku, '') <> '' and (coalesce(nombres, '') <> '' or coalesce(cedula, '') <> '')
      and coalesce(origin, '') <> 'test' and borrado_at is null and not (coalesce(codigo, '') ~ '^PACK-\d{1,3}$')
    order by sheet_row
  loop
    nx := nx + 1;
    update public.paquetes set beta_codigo = 'PQ-' || lpad(nx::text, 4, '0') where id = r.id;
  end loop;
end $$;
