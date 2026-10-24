-- APLICAR en el proyecto Supabase. No poner este archivo en supabase/migrations.
-- 0027: el borrado suave de gift cards y paquetes vive en borrado_at / borrado_por.
-- El import horario pisa orig (y las columnas de la hoja) y no manda estas dos,
-- así que un borrado sobrevive al sync. Tickets (0022) y clientas_registro (0023)
-- ya tienen las columnas; este archivo no las toca.
-- Emilia: los códigos viejos de la hoja pueden repetirse (por ejemplo 26-008).
-- No hay índice único sobre todo codigo_gc. Solo las filas emitidas en la beta
-- o en modo prueba (origin beta/test) tienen que ser únicas. El import no entra.
-- gift_cards_codigo_uidx no se crea. Si una corrida anterior lo dejó, se baja.

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

drop index if exists public.gift_cards_codigo_uidx;

create index if not exists gift_cards_codigo_lower_idx
  on public.gift_cards (lower(btrim(codigo_gc)))
  where origin in ('beta', 'test')
    and btrim(coalesce(codigo_gc, '')) <> '';

create or replace function public.gift_cards_codigo_unico() returns trigger
language plpgsql as $$
begin
  if coalesce(new.origin, '') not in ('beta', 'test') then
    return new;
  end if;
  if btrim(coalesce(new.codigo_gc, '')) = '' then
    return new;
  end if;
  if exists (
    select 1
    from public.gift_cards g
    where lower(btrim(g.codigo_gc)) = lower(btrim(new.codigo_gc))
      and g.origin in ('beta', 'test')
      and g.id is distinct from new.id
  ) then
    raise exception 'El código % ya fue emitido en la beta', btrim(new.codigo_gc);
  end if;
  return new;
end $$;

drop trigger if exists trg_gift_cards_zz_codigo_unico on public.gift_cards;
create trigger trg_gift_cards_zz_codigo_unico
  before insert or update of codigo_gc, origin on public.gift_cards
  for each row execute function public.gift_cards_codigo_unico();
