-- TK137: hotfix 19/11/2026 ~14:27 America/Guayaquil.
-- Crear «Bioderma Sensibio H2O Eye» sugirió INV-132 y sobrescribió JN-009
-- (codigo_interno INV-132 de TK127). Aditivo: backups primero.
-- 1) Restaura JN-009 a su estado de justo antes del overwrite (audit 99995).
-- 2) Crea el Bioderma como producto nuevo con INV-142 (el siguiente código
--    realmente libre: INV-133..INV-141 ya son codigo_interno / alias de VK/ML).
-- 3) Trigger: sku y codigo_interno no pueden chocar con otro sku, codigo_interno
--    o alias. No se toca el stock ni la foto de JN-009. No se reescriben tickets.

create table if not exists public._bak_20261119_tk137_erp_productos as table public.erp_productos;
create table if not exists public._bak_20261119_tk137_beta_sku_alias as table public.beta_sku_alias;
create table if not exists public._bak_20261119_tk137_jn009_overwrite as
  select * from public.erp_productos
  where id = '3bd4c865-74f0-46c2-a1bd-fb0e867aa0c2';

alter table public._bak_20261119_tk137_erp_productos enable row level security;
alter table public._bak_20261119_tk137_beta_sku_alias enable row level security;
alter table public._bak_20261119_tk137_jn009_overwrite enable row level security;

-- Restaurar JN-009 (mismo id, mismo stock, misma foto). Solo los campos
-- que cambió el overwrite de las 14:27 (sku, nombre, marca, categoria, uso,
-- precio_venta, unidad_consumo). codigo_interno sigue en INV-132 (TK127).
update public.erp_productos
set sku = 'JN-009',
    nombre = 'Black Tea Time Reverse Eye Cream 9ml - Pyunkanf Yul',
    marca = null,
    categoria = null,
    uso = 'ambos',
    precio_venta = 20.00,
    unidad_consumo = null,
    codigo_interno = 'INV-132',
    sku_proveedor = 'JN-009'
where id = '3bd4c865-74f0-46c2-a1bd-fb0e867aa0c2'
  and sku is distinct from 'JN-009';

-- Bioderma Sensibio H2O Eye: producto nuevo, lo que Emilia escribió
-- (nombre, marca Bioderma, categoría Insumo cabina, uso cabina). Stock 0, sin foto.
insert into public.erp_productos (
  id, sku, codigo_interno, nombre, marca, categoria, clase,
  unidad, unidad_consumo, factor_consumo, uso, precio_venta,
  iva, lote_obligatorio, caduca, activo,
  beta_editado_por, beta_editado_at
)
select
  gen_random_uuid(), 'INV-142', 'INV-142',
  'Bioderma Sensibio H2O Eye', 'Bioderma', 'Insumo cabina', 'producto',
  'u', null, 1, 'cabina', null,
  true, false, false, true,
  'sistema:tk137', now()
where not exists (
  select 1 from public.erp_productos
  where sku = 'INV-142' or codigo_interno = 'INV-142'
)
and not exists (
  select 1 from public.beta_sku_alias where alias = 'INV-142'
);

-- Función: ¿este código ya lo tiene otro producto (sku, codigo_interno o alias)?
create or replace function public.erp_codigo_ocupado_por(
  p_code text,
  p_except_id uuid default null,
  p_except_sku text default null
) returns table(sku text, nombre text)
language sql
stable
as $$
  with c as (
    select upper(trim(both from coalesce(p_code, ''))) as code
  )
  select p.sku, p.nombre
  from public.erp_productos p, c
  where c.code <> ''
    and p.id is distinct from p_except_id
    and (
      upper(p.sku) = c.code
      or (coalesce(p.codigo_interno, '') <> '' and upper(p.codigo_interno) = c.code)
    )
  union all
  select coalesce(p.sku, a.sku), coalesce(p.nombre, a.sku)
  from public.beta_sku_alias a
  left join public.erp_productos p on upper(p.sku) = upper(a.sku)
  cross join c
  where c.code <> ''
    and upper(a.alias) = c.code
    and upper(a.sku) is distinct from upper(trim(both from coalesce(p_except_sku, '')))
    and (p.id is null or p.id is distinct from p_except_id)
  limit 1;
$$;

create or replace function public.trg_erp_productos_codigo_libre()
returns trigger
language plpgsql
as $$
declare
  v_hit record;
  v_code text;
begin
  foreach v_code in array array[new.sku, new.codigo_interno]
  loop
    if v_code is null or trim(v_code) = '' then
      continue;
    end if;
    select * into v_hit
    from public.erp_codigo_ocupado_por(v_code, new.id, new.sku)
    limit 1;
    if found then
      raise exception 'El código % ya lo tiene % · %',
        upper(trim(v_code)), v_hit.sku, v_hit.nombre
        using errcode = '23505';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_erp_productos_codigo_libre on public.erp_productos;
create trigger trg_erp_productos_codigo_libre
  before insert or update of sku, codigo_interno
  on public.erp_productos
  for each row
  execute function public.trg_erp_productos_codigo_libre();

create or replace function public.trg_beta_sku_alias_codigo_libre()
returns trigger
language plpgsql
as $$
declare
  v_hit record;
  v_prod uuid;
begin
  select id into v_prod from public.erp_productos where upper(sku) = upper(new.sku) limit 1;
  select * into v_hit
  from public.erp_codigo_ocupado_por(new.alias, v_prod, new.sku)
  limit 1;
  if found then
    raise exception 'El código % ya lo tiene % · %',
      upper(trim(new.alias)), v_hit.sku, v_hit.nombre
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_beta_sku_alias_codigo_libre on public.beta_sku_alias;
create trigger trg_beta_sku_alias_codigo_libre
  before insert or update of alias, sku
  on public.beta_sku_alias
  for each row
  execute function public.trg_beta_sku_alias_codigo_libre();

comment on function public.erp_codigo_ocupado_por(text, uuid, text) is
  'TK137: un código está ocupado si es sku o codigo_interno de otro producto, o un alias de otro SKU.';
-- TK137 (continuación 14:33): restaurar VK-009 y crear Manzanilla Romana como INV-143.
-- El backup _bak_20261119_tk137_erp_productos es de las 14:34 y YA incluye el
-- overwrite de VK-009; no se usa para restaurarlo. Fuente: audit_log 19:33:04.

create table if not exists public._bak_20261119_tk137_vk009_overwrite as
  select * from public.erp_productos
  where id = 'f88b69e9-c317-47f3-818c-d3e949605615';
alter table public._bak_20261119_tk137_vk009_overwrite enable row level security;

update public.erp_productos
set sku = 'VK-009',
    nombre = '[ANUA] Niacinamide 10 TXA 4 Serum 30ml',
    marca = null,
    categoria = null,
    uso = 'venta',
    precio_venta = 47.00,
    unidad_consumo = null,
    codigo_interno = 'INV-133',
    sku_proveedor = 'VK-009'
where id = 'f88b69e9-c317-47f3-818c-d3e949605615'
  and sku is distinct from 'VK-009';

insert into public.erp_productos (
  id, sku, codigo_interno, nombre, marca, categoria, clase,
  unidad, unidad_consumo, factor_consumo, uso, precio_venta,
  iva, lote_obligatorio, caduca, activo,
  beta_editado_por, beta_editado_at
)
select
  gen_random_uuid(), 'INV-143', 'INV-143',
  'Manzanilla Romana - Aroms Natur', 'Aroms Natur', 'Insumo cabina', 'producto',
  'u', null, 1, 'cabina', null,
  true, false, false, true,
  'sistema:tk137', now()
where not exists (
  select 1 from public.erp_productos
  where sku = 'INV-143' or codigo_interno = 'INV-143'
)
and not exists (
  select 1 from public.beta_sku_alias where alias = 'INV-143'
);
