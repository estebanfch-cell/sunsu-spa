-- Espejo de 0021, ya aplicado en la base. NO va en supabase/migrations.
-- 0020 numeró también las filas vacías de la hoja (casillas en FALSE, sin clienta).
-- ticket_hoja_vacia marca esas filas. El trigger, en un INSERT vacío, suelta el TK-SO.
-- En un UPDATE no toca una fila de importación que ya existe (sheet_row, origin sheet):
-- conserva el so_num que ya tiene. El piso del contador es 1678 y reaplicar no lo baja.
-- No reescribe stock ni llama erp_importar_legado().
-- El trigger se llama trg_tickets_so_vacio. Reaplicar reemplaza ese nombre.
-- Si en la base el trigger vive con otro nombre, no dejes los dos activos.

create or replace function public.ticket_hoja_vacia(t public.tickets) returns boolean
language plpgsql stable as $$
declare
  rec jsonb := to_jsonb(t);
  par record;
  txt text;
begin
  if t.sheet_row is null or coalesce(t.origin, '') = 'test' then return false; end if;
  if coalesce(t.estimado, 0) <> 0 then return false; end if;
  foreach txt in array array[
    t.nombre, t.apellido, t.id_3, t.atendido_por, t.facial_hecho, t.compra_pack_3, t.compra_pack_6,
    t.servicios_adicionales, t.recomendaciones, t.notas_generales, t.paquete, t.gift_card, t.venta_gift
  ] loop
    if coalesce(btrim(txt), '') <> '' and lower(btrim(txt)) <> 'false' then return false; end if;
  end loop;
  for par in select key, value from jsonb_each(rec) loop
    if par.key ~ '^(ht|as|ml|ph|jn|su|bv|vk)_' then
      if par.value = 'null'::jsonb then continue; end if;
      if jsonb_typeof(par.value) = 'number' and (par.value::text)::numeric <> 0 then return false; end if;
      if jsonb_typeof(par.value) = 'string' and btrim(par.value #>> '{}') <> '' and lower(btrim(par.value #>> '{}')) <> 'false' then return false; end if;
    end if;
  end loop;
  return true;
end $$;

create or replace function public.tickets_so_vacio() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and old.sheet_row is not null
     and coalesce(old.origin, 'sheet') = 'sheet'
  then
    new.so_num := old.so_num;
    return new;
  end if;
  if public.ticket_hoja_vacia(new) then
    new.so_num := null;
    if new.orig is not null then
      new.orig := new.orig - 'so_num';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_tickets_so_vacio on public.tickets;
create trigger trg_tickets_so_vacio
  before insert or update on public.tickets
  for each row execute function public.tickets_so_vacio();

insert into public.doc_seq (serie, ultimo)
values (
  'TK-SO',
  greatest(
    1678,
    coalesce((
      select max((regexp_match(so_num, '([0-9]+)$'))[1]::int)
      from public.tickets
      where so_num ~ '^TK-SO-[0-9]+$'
        and coalesce(origin, '') <> 'test'
    ), 0)
  )
)
on conflict (serie) do update
set ultimo = greatest(
  1678,
  excluded.ultimo,
  coalesce((
    select max((regexp_match(so_num, '([0-9]+)$'))[1]::int)
    from public.tickets
    where so_num ~ '^TK-SO-[0-9]+$'
      and coalesce(origin, '') <> 'test'
  ), 0)
);
