-- 0033: código único de paquete PACK-001, PACK-002… (aditivo: columna nueva + secuencia + trigger).
-- No toca columnas existentes ni la hoja. Orden de asignación inicial: fecha de compra (ano/mes/dia),
-- luego fila de la hoja (positiva), luego creado/id. Filas de prueba (origin='test') llevan TEST-PACK-nnn
-- con su propia secuencia, para no consumir números reales.
alter table public.paquetes add column if not exists codigo text;
create unique index if not exists paquetes_codigo_uidx on public.paquetes (codigo) where codigo is not null;
create sequence if not exists public.paquetes_codigo_seq;
create sequence if not exists public.paquetes_codigo_test_seq;

with base as (
  select id, sheet_row, created_at,
    make_date(case when nullif(ano,0)::int < 100 then nullif(ano,0)::int + 2000 else nullif(ano,0)::int end, nullif(mes,0)::int, nullif(dia,0)::int) f
  from public.paquetes where codigo is null and origin is distinct from 'test' and coalesce(sku,'') <> ''
), eff as (
  -- filas de la hoja sin fecha heredan la última fecha anterior de la hoja (la hoja es cronológica)
  select id, sheet_row, created_at, coalesce(f, max(f) over (order by case when sheet_row > 0 then sheet_row end nulls last, created_at, id rows unbounded preceding)) fe
  from base
), ord as (
  select id, row_number() over (order by fe nulls first, case when sheet_row > 0 then sheet_row end nulls last, created_at, id) n from eff
)
update public.paquetes p set codigo = 'PACK-' || lpad(ord.n::text, greatest(3, length(ord.n::text)), '0') from ord where ord.id = p.id;
select setval('public.paquetes_codigo_seq', greatest(1, (select count(*) from public.paquetes where codigo like 'PACK-%')), (select count(*) from public.paquetes where codigo like 'PACK-%') > 0);

create or replace function public.paquetes_codigo() returns trigger language plpgsql as $$
declare c text;
begin
  -- import.py hace upsert por sheet_row (on_conflict=sheet_row, merge-duplicates): el BEFORE INSERT
  -- corre aunque la fila ya exista. Reusar el código de esa fila evita gastar números en cada sync
  -- (y como el payload no trae 'codigo', el UPDATE del upsert no lo pisa).
  if (new.codigo is null or new.codigo = '') and new.sheet_row is not null and new.sheet_row > 0 then
    select codigo into c from public.paquetes where sheet_row = new.sheet_row and codigo is not null limit 1;
    if c is not null then new.codigo := c; return new; end if;
  end if;
  if (new.codigo is null or new.codigo = '') and coalesce(new.sku,'') <> '' then
    if new.origin = 'test' then new.codigo := 'TEST-PACK-' || lpad(nextval('public.paquetes_codigo_test_seq')::text, greatest(3, length(nextval('public.paquetes_codigo_test_seq')::text)), '0');
    else new.codigo := 'PACK-' || lpad(nextval('public.paquetes_codigo_seq')::text, greatest(3, length(nextval('public.paquetes_codigo_seq')::text)), '0'); end if;
  end if;
  return new;
end $$;
-- 'zz_' para correr DESPUÉS de trg_paquetes_origen (que fija origin).
drop trigger if exists zz_paquetes_codigo on public.paquetes;
create trigger zz_paquetes_codigo before insert on public.paquetes for each row execute function public.paquetes_codigo();
-- Filas de prueba ya existentes
update public.paquetes set codigo = 'TEST-PACK-' || lpad(nextval('public.paquetes_codigo_test_seq')::text, greatest(3, length(nextval('public.paquetes_codigo_test_seq')::text)), '0') where origin = 'test' and codigo is null;
