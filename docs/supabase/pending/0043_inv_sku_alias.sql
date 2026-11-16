-- 0043: Familia INV con 3 dígitos (Emilia 16/11). Solo agrega una tabla de alias; no toca
-- historial_ventas, tickets, catalogo ni ninguna columna que sincroniza la hoja, así que la
-- sincronización horaria no lo puede revertir. Reversible: drop table public.beta_sku_alias.
-- La beta ya compara INV-000123 = INV-123 en código (skuCode/codigoNorm); esta tabla deja el mapeo
-- escrito y permite buscar un producto por su código viejo.

create table if not exists public.beta_sku_alias (
  alias text primary key,
  sku text not null,
  origen text not null default 'beta',
  nota text,
  created_at timestamptz not null default now()
);
create index if not exists beta_sku_alias_sku on public.beta_sku_alias (upper(sku));
alter table public.beta_sku_alias enable row level security;
comment on table public.beta_sku_alias is 'Código viejo → SKU de la beta (ej. SUNSU-INV-000002 → INV-002). Solo lectura para buscar y mostrar; los datos originales no se reescriben.';

do $$
begin
  if exists (select 1 from pg_proc where proname = 'audit_trigger') then
    if not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = 'public.beta_sku_alias'::regclass) then
      execute 'create trigger trg_audit after insert or update or delete on public.beta_sku_alias for each row execute function public.audit_trigger(''alias'')';
    end if;
  end if;
end $$;

-- Semilla: cada código INV largo del historial de ventas que corresponde a un producto existente
-- con el mismo número (INV-0000NN → INV-0NN). Solo si el destino existe; nada se inventa.
insert into public.beta_sku_alias (alias, sku, origen, nota)
select distinct on (x.alias) x.alias, e.sku, 'historial_ventas', 'INV de 6 dígitos del sistema viejo'
from (
  select upper(btrim(h.sku)) as alias,
         'INV-' || lpad((substring(upper(h.sku) from 'INV[-_ ]?([0-9]+)$'))::bigint::text, 3, '0') as corto
  from public.historial_ventas h
  where upper(btrim(h.sku)) ~ '^(SUNSU-)?INV[-_ ]?[0-9]{4,}$'
) x
join public.erp_productos e on upper(e.sku) = x.corto
order by x.alias
on conflict (alias) do nothing;
