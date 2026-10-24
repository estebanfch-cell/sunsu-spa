-- APLICAR en el proyecto Supabase. No poner este archivo en supabase/migrations.
-- 0027: el borrado suave de gift cards y paquetes vive en borrado_at / borrado_por.
-- El import horario pisa orig (y las columnas de la hoja) y no manda estas dos,
-- así que un borrado sobrevive al sync. Tickets (0022) y clientas_registro (0023)
-- ya tienen las columnas; este archivo no las toca.
-- El código de una gift card no se reemite, ni aunque la fila esté borrada.
-- Si el bloque final nombra un código repetido, deja una sola fila con ese
-- código (conserva la borrada) y vuelve a correr este archivo: es idempotente.

alter table public.gift_cards add column if not exists borrado_at timestamptz;
alter table public.gift_cards add column if not exists borrado_por text;
alter table public.paquetes add column if not exists borrado_at timestamptz;
alter table public.paquetes add column if not exists borrado_por text;

update public.gift_cards
set borrado_at = coalesce(borrado_at, now()),
    borrado_por = coalesce(nullif(btrim(borrado_por), ''), 'import-orig')
where borrado_at is null
  and coalesce(orig, '{}'::jsonb)->>'borrado' = 'true';

update public.paquetes
set borrado_at = coalesce(borrado_at, now()),
    borrado_por = coalesce(nullif(btrim(borrado_por), ''), 'import-orig')
where borrado_at is null
  and coalesce(orig, '{}'::jsonb)->>'borrado' = 'true';

do $$
declare dups text;
begin
  select string_agg(codigo || ' (filas ' || filas || ')', ', ' order by codigo)
    into dups
  from (
    select lower(btrim(codigo_gc)) as codigo,
           string_agg(sheet_row::text, '+' order by sheet_row) as filas
    from public.gift_cards
    where btrim(coalesce(codigo_gc, '')) <> ''
    group by 1
    having count(*) > 1
  ) x;
  if dups is not null then
    raise exception 'Hay códigos de gift card repetidos. Deja una sola fila por código (conserva la borrada) y vuelve a correr 0027: %', dups;
  end if;
end $$;

create unique index if not exists gift_cards_codigo_uidx
  on public.gift_cards (lower(btrim(codigo_gc)))
  where btrim(coalesce(codigo_gc, '')) <> '';
