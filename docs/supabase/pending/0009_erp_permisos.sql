-- 0009_erp_permisos.sql — incremental e idempotente. NO va en supabase/migrations.
-- 0008 ya está aplicado (app_usuarios, verificar_pin, gift_cards_digitales,
-- seguimiento_memoria, tarjetas_enviadas, wa_enviados, historial_comisiones,
-- cabina_fotos, app_settings, ticket_seq, oc_seq_2026, cot_seq). No se recrea.
--
--   supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0007_beta_api.sql
--   supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0009_erp_permisos.sql
--
-- Estructura tipo Minecore (bodegas Venta y Cabina, kardex, compras, ticket = OV)
-- mapeada desde el espejo Sunsu, más RLS. El N de paquetes sigue en cosmetologas.es_cosmetologa.

comment on column public.cosmetologas.es_cosmetologa is
  'Atributo aparte del rol. metas_ciclo y el N de paquetes leen SOLO esta bandera, nunca rol = cosmetologa.';

-- ── Columnas que el login y la matriz necesitan encima de 0008 ──
alter table public.app_usuarios add column if not exists rol text;
alter table public.app_usuarios add column if not exists nombre text;
alter table public.app_usuarios add column if not exists short text;
alter table public.app_usuarios add column if not exists color text;
alter table public.app_usuarios add column if not exists activo boolean default true;
alter table public.app_usuarios add column if not exists bloqueado boolean default false;
alter table public.app_usuarios add column if not exists bloqueado_hasta timestamptz;
alter table public.app_usuarios add column if not exists pin_reset boolean default false;
alter table public.app_usuarios add column if not exists es_cosmetologa boolean;
comment on column public.app_usuarios.es_cosmetologa is
  'Copia de presentación. NO entra al cálculo de N. La fuente es cosmetologas.es_cosmetologa.';

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='app_usuarios' and column_name='rol') then
    update public.app_usuarios set rol = 'super_admin' where rol = 'admin_master';
    update public.app_usuarios set rol = 'recepcion' where rol in ('reception','recepción');
    update public.app_usuarios u set rol = case
      when exists (select 1 from public.cosmetologas c where c.id::text = u.id::text and c.es_cosmetologa) then 'cosmetologa'
      else 'asistente_cosmetologia' end
    where u.rol = 'staff';
  end if;
end $$;

create table if not exists public.login_intentos (
  id bigserial primary key,
  ip text not null default '',
  ts timestamptz not null default now()
);
alter table public.login_intentos enable row level security;
create index if not exists login_intentos_ip_ts_idx on public.login_intentos (ip, ts desc);

-- Compara el PIN con verificar_pin (bcrypt, service role) y aplica el candado.
create or replace function public.login_pin(p_pin text, p_ip text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
  n int;
  uid text;
  intentos int;
  hasta timestamptz;
begin
  if coalesce(btrim(p_pin), '') = '' then
    return jsonb_build_object('error', 'Falta el PIN');
  end if;
  select count(*) into n from public.login_intentos
   where ip = coalesce(p_ip, '') and ts > now() - interval '15 minutes';
  if coalesce(p_ip, '') <> '' and n >= 8 then
    return jsonb_build_object('error', 'Demasiados intentos. Espera 15 minutos.');
  end if;
  begin
    execute 'select to_jsonb(r) from public.verificar_pin($1) r' into v using p_pin;
  exception when others then
    begin
      execute 'select public.verificar_pin($1)::jsonb' into v using p_pin;
    exception when others then
      return jsonb_build_object('error', 'No se pudo verificar el PIN');
    end;
  end;
  if v is null or v = 'null'::jsonb or v = '{}'::jsonb
     or coalesce(v->>'ok', 'true') = 'false' then
    insert into public.login_intentos(ip, ts) values (coalesce(p_ip, ''), now());
    uid := nullif(v->>'id', '');
    if uid is not null then
      execute 'update public.app_usuarios set intentos_fallidos = coalesce(intentos_fallidos,0) + 1 where id::text = $1' using uid;
      execute 'select intentos_fallidos from public.app_usuarios where id::text = $1' into intentos using uid;
      if coalesce(intentos, 0) >= 5 then
        execute 'update public.app_usuarios set bloqueado_hasta = now() + interval ''15 minutes'' where id::text = $1' using uid;
      end if;
    end if;
    return jsonb_build_object('error', 'PIN incorrecto');
  end if;
  if v ? 'user' then v := v->'user'; end if;
  uid := coalesce(v->>'id', v->>'usuario');
  if uid is not null then
    execute 'select bloqueado_hasta from public.app_usuarios where id::text = $1' into hasta using uid;
    if hasta is not null and hasta > now() then
      return jsonb_build_object('error', 'Demasiados intentos. Espera unos minutos.');
    end if;
    execute 'update public.app_usuarios set intentos_fallidos = 0, bloqueado_hasta = null where id::text = $1' using uid;
  end if;
  return jsonb_build_object('ok', true, 'user', v);
end $$;

revoke all on function public.login_pin(text, text) from public, anon, authenticated;
grant execute on function public.login_pin(text, text) to service_role;

create or replace function public.next_ticket_num() returns bigint
language sql security definer set search_path = public as $$
  select nextval('public.ticket_seq');
$$;
revoke all on function public.next_ticket_num() from public, anon, authenticated;
grant execute on function public.next_ticket_num() to service_role;

create or replace function public.next_oc_num() returns text
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  n := nextval('public.oc_seq_2026');
  return 'OC-' || to_char(current_date, 'YYYY') || '-' || lpad(n::text, 4, '0');
end $$;
revoke all on function public.next_oc_num() from public, anon, authenticated;
grant execute on function public.next_oc_num() to service_role;

-- ── Matriz rol → módulo (super_admin la edita; admin no se puede rebajar) ──
create table if not exists public.app_modulos (
  rol text not null,
  modulo text not null,
  acceso text not null check (acceso in ('no', 'propio', 'todos')),
  primary key (rol, modulo)
);
alter table public.app_modulos enable row level security;

insert into public.app_modulos (rol, modulo, acceso) values
  ('cosmetologa','inicio','todos'),('cosmetologa','tickets','propio'),('cosmetologa','comisiones','propio'),
  ('cosmetologa','rol_pagos','propio'),('cosmetologa','asistencia','propio'),('cosmetologa','productos','todos'),
  ('cosmetologa','clientes','propio'),('cosmetologa','inventario','todos'),('cosmetologa','paquetes','propio'),
  ('cosmetologa','bitacora','todos'),('cosmetologa','cabina','todos'),
  ('asistente_cosmetologia','inicio','todos'),('asistente_cosmetologia','tickets','propio'),
  ('asistente_cosmetologia','comisiones','propio'),('asistente_cosmetologia','rol_pagos','propio'),
  ('asistente_cosmetologia','asistencia','propio'),('asistente_cosmetologia','productos','todos'),
  ('asistente_cosmetologia','inventario','todos'),('asistente_cosmetologia','transferencias','todos'),
  ('asistente_cosmetologia','conteos','todos'),('asistente_cosmetologia','bitacora','todos'),
  ('asistente_cosmetologia','cabina','todos'),
  ('recepcion','inicio','todos'),('recepcion','tickets','propio'),('recepcion','comisiones','propio'),
  ('recepcion','rol_pagos','propio'),('recepcion','asistencia','propio'),('recepcion','productos','todos'),
  ('recepcion','clientes','todos'),('recepcion','inventario','todos'),('recepcion','cotizaciones_cliente','todos'),
  ('recepcion','paquetes','todos'),('recepcion','gift_cards','todos'),('recepcion','caja','todos'),
  ('gerente','inicio','todos'),('gerente','tickets','propio'),('gerente','comisiones','propio'),
  ('gerente','rol_pagos','propio'),('gerente','asistencia','propio'),('gerente','productos','todos'),
  ('gerente','clientes','todos'),('gerente','inventario','todos'),('gerente','transferencias','todos'),
  ('gerente','conteos','todos'),('gerente','kardex','todos'),('gerente','cotizaciones_cliente','todos'),
  ('gerente','paquetes','todos'),('gerente','gift_cards','todos'),('gerente','caja','todos'),
  ('gerente','bitacora','todos'),('gerente','cabina','todos')
on conflict (rol, modulo) do nothing;

-- ── Bodegas, catálogo, kardex, compras, orden de venta ──
create table if not exists public.erp_bodegas (
  id uuid primary key, codigo text unique not null, nombre text not null,
  tipo text not null check (tipo in ('cabina','venta')), activo boolean not null default true
);
insert into public.erp_bodegas (id, codigo, nombre, tipo) values
  ('11111111-1111-4111-8111-111111111111','VENTA','Venta','venta'),
  ('22222222-2222-4222-8222-222222222222','CABINA','Cabina','cabina')
on conflict (codigo) do nothing;

create table if not exists public.erp_productos (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null, nombre text not null, marca text, categoria text,
  clase text not null default 'producto' check (clase in ('producto','servicio','paquete','gift')),
  unidad text default 'u', unidad_consumo text, factor_consumo numeric default 1,
  uso text not null check (uso in ('cabina','venta','ambos')),
  precio_venta numeric(12,2), costo_promedio numeric(12,4) not null default 0,
  iva boolean not null default true, lote_obligatorio boolean not null default false,
  caduca boolean not null default false, foto_url text, activo boolean not null default true,
  legacy_tabla text
);
create table if not exists public.erp_producto_bodega (
  producto_id uuid references public.erp_productos(id),
  bodega_id uuid references public.erp_bodegas(id),
  stock_min numeric not null default 0, punto_reorden numeric not null default 0,
  primary key (producto_id, bodega_id)
);
create table if not exists public.erp_stock (
  id bigserial primary key,
  producto_id uuid not null references public.erp_productos(id),
  bodega_id uuid not null references public.erp_bodegas(id),
  sububicacion text not null default '', lote text not null default '',
  caducidad date, cantidad numeric not null default 0, updated_at timestamptz not null default now(),
  unique (producto_id, bodega_id, sububicacion, lote)
);
create table if not exists public.erp_movimientos (
  id bigserial primary key, fecha timestamptz not null default now(), actor text not null,
  producto_id uuid not null, bodega_id uuid not null,
  sububicacion text not null default '', lote text not null default '',
  delta numeric not null, saldo numeric, costo_unit numeric(12,4),
  tipo text not null check (tipo in ('recepcion','devolucion_prov','venta','consumo_cabina','transferencia_out','transferencia_in','ajuste','conteo','anulacion')),
  doc_tipo text, doc_id uuid, ticket_ref text, aprobado_negativo_por text, nota text, legacy_ref text unique
);
create index if not exists erp_mov_prod_idx on public.erp_movimientos (producto_id, bodega_id, fecha);

create or replace function public.erp_chk_uso() returns trigger language plpgsql as $$
declare u text; t text;
begin
  select uso into u from public.erp_productos where id = new.producto_id;
  select tipo into t from public.erp_bodegas where id = new.bodega_id;
  if u is null or t is null then return new; end if;
  if u <> 'ambos' and u <> t then
    raise exception 'Producto de uso % no puede ir a bodega %', u, t;
  end if;
  return new;
end $$;
drop trigger if exists trg_erp_stock_uso on public.erp_stock;
create trigger trg_erp_stock_uso before insert or update on public.erp_stock
  for each row execute function public.erp_chk_uso();
drop trigger if exists trg_erp_mov_uso on public.erp_movimientos;
create trigger trg_erp_mov_uso before insert on public.erp_movimientos
  for each row execute function public.erp_chk_uso();

create or replace function public.erp_no_borra_kardex() returns trigger language plpgsql as $$
begin
  raise exception 'El kardex no se borra. Se anula con el movimiento inverso.';
end $$;
drop trigger if exists trg_erp_mov_no_delete on public.erp_movimientos;
create trigger trg_erp_mov_no_delete before delete on public.erp_movimientos
  for each row execute function public.erp_no_borra_kardex();

create table if not exists public.erp_proveedores (
  id uuid primary key default gen_random_uuid(), nombre text not null, ruc text, contacto text,
  email text, telefono text, plazo_dias int default 0, activo boolean not null default true,
  legacy_sheet_row int unique
);
create table if not exists public.erp_clientes (
  id uuid primary key default gen_random_uuid(), cedula text, nombre text not null, apellido text,
  telefono text, email text, sector text, notas text, activo boolean not null default true,
  legacy_sheet_row int unique
);
create table if not exists public.erp_rfq (
  id uuid primary key default gen_random_uuid(), numero text unique, fecha date default current_date,
  estado text not null default 'borrador', nota text, creado_por text
);
create table if not exists public.erp_rfq_prov (
  id uuid primary key default gen_random_uuid(), rfq_id uuid references public.erp_rfq(id),
  proveedor_id uuid, respondida boolean default false, plazo_dias int, validez date
);
create table if not exists public.erp_rfq_lineas (
  id uuid primary key default gen_random_uuid(), rfq_id uuid, rfq_prov_id uuid, producto_id uuid,
  proveedor_id uuid, cantidad numeric, precio numeric(12,4), plazo text, elegida boolean default false
);
create table if not exists public.erp_oc (
  id uuid primary key default gen_random_uuid(), numero text unique, proveedor_id uuid, rfq_id uuid,
  fecha date, fecha_esperada date, bodega_destino_id uuid,
  estado text not null default 'abierta',
  subtotal numeric(12,2) default 0, iva numeric(12,2) default 0, flete numeric(12,2) default 0,
  total numeric(12,2) default 0, pagado numeric(12,2) default 0, saldo numeric(12,2) default 0,
  estado_pago text default 'pendiente', nota text, creado_por text, legacy_sheet_row int unique
);
create table if not exists public.erp_oc_lineas (
  id uuid primary key default gen_random_uuid(), oc_id uuid references public.erp_oc(id) on delete cascade,
  producto_id uuid, cantidad numeric not null, precio numeric(12,4) not null, descuento_pct numeric default 0,
  bodega_id uuid, subtotal numeric(12,2), recibido numeric default 0, plazo text, orden int
);
create table if not exists public.erp_recepciones (
  id uuid primary key default gen_random_uuid(), oc_id uuid, numero text unique,
  fecha timestamptz default now(), recibido_por text, factura_prov text, nota text, anulada boolean default false
);
create table if not exists public.erp_recepcion_lineas (
  id uuid primary key default gen_random_uuid(), recepcion_id uuid, oc_linea_id uuid, producto_id uuid,
  bodega_id uuid not null, lote text default '', caducidad date, cantidad numeric not null, costo_unit numeric(12,4)
);
create table if not exists public.erp_transferencias (
  id uuid primary key default gen_random_uuid(), numero text unique, origen_id uuid, destino_id uuid,
  estado text default 'borrador', fecha timestamptz default now(), creado_por text, recibido_por text, nota text
);
create table if not exists public.erp_transferencia_lineas (
  id uuid primary key default gen_random_uuid(), transferencia_id uuid, producto_id uuid, lote text default '', cantidad numeric
);
create table if not exists public.erp_conteos (
  id uuid primary key default gen_random_uuid(), numero text unique, bodega_id uuid,
  estado text default 'abierto', fecha timestamptz default now(), creado_por text, legacy_ref text unique, nota text
);
create table if not exists public.erp_conteo_lineas (
  conteo_id uuid, producto_id uuid, lote text default '', sistema numeric, contado numeric,
  primary key (conteo_id, producto_id, lote)
);
create table if not exists public.erp_ajustes (
  id uuid primary key default gen_random_uuid(), numero text unique, bodega_id uuid,
  motivo text, nota text, creado_por text, fecha timestamptz default now()
);
create table if not exists public.erp_ordenes_venta (
  id uuid primary key default gen_random_uuid(), numero text unique, ticket_ref text, ticket_sheet_row int unique,
  cliente_id uuid, cedula text, nombre text, fecha timestamptz, estado text default 'despachada',
  subtotal numeric(12,2) default 0, iva numeric(12,2) default 0, total numeric(12,2) default 0,
  bodega_id uuid, nota text, creado_por text
);
create table if not exists public.erp_ov_lineas (
  id uuid primary key default gen_random_uuid(), ov_id uuid, producto_id uuid, sku text, nombre text,
  cantidad numeric, precio numeric(12,2), descuento_pct numeric default 0, subtotal numeric(12,2),
  clase text, bodega_id uuid
);
create table if not exists public.erp_tickets_procesados (
  ticket_ref text, linea_ref text, tipo text, estado text default 'ok', procesado timestamptz default now(),
  primary key (ticket_ref, linea_ref)
);
create table if not exists public.erp_avisos (
  id bigserial primary key, tipo text, ref text, texto text, destino text, usuario text,
  estado text default 'abierto', creado timestamptz default now(), cerrado timestamptz
);
create table if not exists public.erp_servicios (
  id uuid primary key default gen_random_uuid(), codigo text unique, nombre text not null, activo boolean default true
);
create table if not exists public.erp_receta (
  servicio_id uuid, producto_id uuid, cantidad numeric not null, unidad text,
  primary key (servicio_id, producto_id)
);

-- Mapeo del espejo. No repostea si el legacy_ref ya está en el kardex.
create or replace function public.erp_importar_legado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  n_prod int := 0; n_ent int := 0; n_vta int := 0; n_cab int := 0;
  vid uuid := '11111111-1111-4111-8111-111111111111';
  cid uuid := '22222222-2222-4222-8222-222222222222';
begin
  perform set_config('app.user', 'importacion legado', true);

  insert into public.erp_productos (sku, nombre, clase, uso, precio_venta, costo_promedio, activo, legacy_tabla)
  select upper(regexp_replace(c.sku, '^SUNSU-', '')),
         coalesce(nullif(c.producto_servicio, ''), c.sku),
         case when c.tipo ilike '%gift%' then 'gift'
              when c.tipo ilike '%paq%' or c.tipo ilike '%pack%' then 'paquete'
              when c.tipo ilike '%serv%' or c.tipo ilike '%facial%' then 'servicio'
              else 'producto' end,
         case when exists (select 1 from public.cabina_inventario k
                            where upper(regexp_replace(coalesce(k.sku_catalogo, k.codigo), '^SUNSU-', ''))
                                  = upper(regexp_replace(c.sku, '^SUNSU-', '')))
                and c.sku ~* '^(SUNSU-)?(HT|AS|ML|PH|JN|BV|SU|VK)-' then 'ambos'
              when exists (select 1 from public.cabina_inventario k
                            where upper(regexp_replace(coalesce(k.sku_catalogo, k.codigo), '^SUNSU-', ''))
                                  = upper(regexp_replace(c.sku, '^SUNSU-', ''))) then 'cabina'
              when c.tipo ilike '%serv%' or c.tipo ilike '%facial%' then 'cabina'
              else 'venta' end,
         coalesce(c.total_con_iva, c.subtotal),
         coalesce(nullif(regexp_replace(coalesce(c.precio_compra, ''), '[^0-9.]', '', 'g'), '')::numeric, 0),
         coalesce(c.activo, true), 'catalogo'
  from public.catalogo c
  where coalesce(c.sku, '') <> ''
    and not exists (select 1 from public.erp_productos p where p.sku = upper(regexp_replace(c.sku, '^SUNSU-', '')));
  get diagnostics n_prod = row_count;

  insert into public.erp_productos (sku, nombre, clase, uso, unidad, factor_consumo, costo_promedio, activo, legacy_tabla)
  select upper(regexp_replace(coalesce(k.sku_catalogo, k.codigo), '^SUNSU-', '')),
         coalesce(k.producto, k.codigo), 'producto', 'cabina', coalesce(k.unidad, 'u'),
         coalesce(k.contenido_envase, 1), coalesce(k.costo_por_unidad, 0),
         coalesce(k.activo, 'SI') ilike 'SI%', 'cabina_inventario'
  from public.cabina_inventario k
  where coalesce(k.sku_catalogo, k.codigo, '') <> ''
    and not exists (
      select 1 from public.erp_productos p
      where p.sku = upper(regexp_replace(coalesce(k.sku_catalogo, k.codigo), '^SUNSU-', ''))
    );

  insert into public.erp_proveedores (nombre, ruc, telefono, email, legacy_sheet_row)
  select p.nombre, p.ruc, p.telefono, p.email, p.sheet_row
  from public.proveedores p
  where coalesce(p.nombre, '') <> ''
    and not exists (select 1 from public.erp_proveedores e where e.legacy_sheet_row = p.sheet_row);

  insert into public.erp_clientes (cedula, nombre, apellido, telefono, sector, legacy_sheet_row)
  select r.cedula, coalesce(r.nombre, 'Sin nombre'), r.apellido, r.telefono, r.sector_donde_vive, r.sheet_row
  from public.clientas_registro r
  where coalesce(r.nombre, r.cedula, '') <> ''
    and not exists (select 1 from public.erp_clientes c where c.legacy_sheet_row = r.sheet_row);

  insert into public.erp_oc (numero, proveedor_id, fecha, estado, nota, creado_por, legacy_sheet_row)
  select coalesce(nullif(o.numorden, ''), 'OC-LEG-' || o.sheet_row),
         (select id from public.erp_proveedores p where lower(p.nombre) = lower(o.proveedor) limit 1),
         current_date, 'abierta', left(coalesce(o.json, ''), 500), 'import', o.sheet_row
  from public.ordenes_compra o
  where not exists (select 1 from public.erp_oc e where e.legacy_sheet_row = o.sheet_row);

  insert into public.erp_movimientos (actor, producto_id, bodega_id, delta, saldo, tipo, doc_tipo, nota, legacy_ref)
  select coalesce(nullif(e.registrado_por, ''), 'import'), p.id, vid, e.cant_recibida_llenar_aqui,
         e.cant_recibida_llenar_aqui, 'recepcion', 'entrada', e.notas, 'entrada:' || e.sheet_row
  from public.inventario_entradas e
  join public.erp_productos p on p.sku = upper(regexp_replace(coalesce(e.sku, ''), '^SUNSU-', ''))
  where coalesce(e.cant_recibida_llenar_aqui, 0) > 0
    and coalesce(e.notas, '') not ilike '%COMPRA DIRECTA%'
    and not exists (select 1 from public.erp_movimientos m where m.legacy_ref = 'entrada:' || e.sheet_row);
  get diagnostics n_ent = row_count;

  insert into public.erp_movimientos (actor, producto_id, bodega_id, delta, tipo, doc_tipo, ticket_ref, nota, legacy_ref)
  select coalesce(v.cosm, 'import'), p.id, vid, -v.qty, 'venta', 'ticket', 'TK-ROW-' || t.sheet_row,
         'venta importada', 'vta:' || v.ticket_id || ':' || v.codigo
  from public.v_ticket_productos v
  join public.tickets t on t.id = v.ticket_id
  join public.erp_productos p on p.sku = upper(regexp_replace(v.codigo, '^SUNSU-', ''))
  where t."timestamp" is not null
    and (t."timestamp" at time zone 'UTC')::date >= date '2026-05-22'
    and not exists (select 1 from public.erp_movimientos m where m.legacy_ref = 'vta:' || v.ticket_id || ':' || v.codigo);
  get diagnostics n_vta = row_count;

  insert into public.erp_movimientos (actor, producto_id, bodega_id, delta, tipo, doc_tipo, nota, legacy_ref)
  select 'import', p.id, cid,
         coalesce(k.stock_total, coalesce(k.envases_cerrados, 0) + coalesce(k.bodega_cerrados, 0)),
         'conteo', 'cabina', 'saldo de cabina importado', 'cabina:' || k.sheet_row
  from public.cabina_inventario k
  join public.erp_productos p on p.sku = upper(regexp_replace(coalesce(k.sku_catalogo, k.codigo), '^SUNSU-', ''))
  where coalesce(k.stock_total, coalesce(k.envases_cerrados, 0) + coalesce(k.bodega_cerrados, 0)) <> 0
    and not exists (select 1 from public.erp_movimientos m where m.legacy_ref = 'cabina:' || k.sheet_row);
  get diagnostics n_cab = row_count;

  insert into public.erp_stock (producto_id, bodega_id, sububicacion, lote, cantidad)
  select m.producto_id, m.bodega_id, '', '', sum(m.delta)
  from public.erp_movimientos m
  group by 1, 2
  on conflict (producto_id, bodega_id, sububicacion, lote) do update set cantidad = excluded.cantidad, updated_at = now();

  insert into public.erp_ordenes_venta (numero, ticket_ref, ticket_sheet_row, cedula, nombre, fecha, estado, creado_por)
  select distinct 'TK-ROW-' || t.sheet_row, 'TK-ROW-' || t.sheet_row, t.sheet_row, t.id_3,
         trim(coalesce(t.nombre, '') || ' ' || coalesce(t.apellido, '')), t."timestamp", 'despachada', 'import'
  from public.tickets t
  where exists (select 1 from public.erp_movimientos m where m.ticket_ref = 'TK-ROW-' || t.sheet_row)
    and not exists (select 1 from public.erp_ordenes_venta o where o.ticket_sheet_row = t.sheet_row);

  insert into public.erp_tickets_procesados (ticket_ref, linea_ref, tipo, estado)
  select m.ticket_ref, m.legacy_ref, 'venta', 'ok'
  from public.erp_movimientos m
  where m.legacy_ref like 'vta:%' and m.ticket_ref is not null
  on conflict do nothing;

  insert into public.erp_servicios (codigo, nombre)
  select distinct upper(p.sku), coalesce(p.facial, p.sku)
  from public.cabina_protocolos p
  where coalesce(p.sku, '') <> '' and coalesce(p.vigente, 'SI') ilike 'SI%'
  on conflict (codigo) do nothing;

  insert into public.erp_receta (servicio_id, producto_id, cantidad, unidad)
  select s.id, pr.id, coalesce(pa.cantidad, 1), pa.unidad
  from public.cabina_protocolo_pasos pa
  join public.erp_servicios s on s.codigo = upper(pa.sku)
  join public.erp_productos pr on pr.sku = upper(regexp_replace(coalesce(pa.producto_cod, ''), '^SUNSU-', ''))
  where coalesce(pa.producto_cod, '') <> ''
  on conflict do nothing;

  return jsonb_build_object('productos_nuevos', n_prod, 'entradas', n_ent, 'ventas', n_vta, 'cabina', n_cab,
    'nota', 'El stock de Venta es entradas recibidas menos ventas desde 2026-05-22. Sin saldo inicial de la hoja INVENTARIO el número puede no cuadrar. Los conteos físicos históricos no se repostean.');
end $$;

select public.erp_importar_legado();

-- ── RLS: sunsu_rls no salta las políticas; service_role sí, y el API filtra igual ──
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'sunsu_rls') then create role sunsu_rls nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'sunsu_admin') then create role sunsu_admin nologin; end if;
end $$;
grant sunsu_rls to service_role;
grant sunsu_admin to service_role;
grant usage on schema public to sunsu_rls, sunsu_admin;
grant select, insert, update, delete on all tables in schema public to sunsu_admin;
grant select, insert, update, delete on all tables in schema public to sunsu_rls;

create or replace function public.app_rol() returns text language sql stable as $$
  select nullif(current_setting('app.rol', true), '');
$$;
create or replace function public.app_es_admin() returns boolean language sql stable as $$
  select public.app_rol() in ('admin', 'super_admin', 'admin_master');
$$;
create or replace function public.app_acceso(p_modulo text) returns text language sql stable as $$
  select case
    when public.app_es_admin() then 'todos'
    when p_modulo = 'permisos' then case when public.app_rol() = 'super_admin' then 'todos' else 'no' end
    when p_modulo = 'ver_costos' and public.app_rol() not in ('admin', 'super_admin') then 'no'
    else coalesce((select m.acceso from public.app_modulos m where m.rol = public.app_rol() and m.modulo = p_modulo), 'no')
  end;
$$;
create or replace function public.app_es_propio(p_nombre text) returns boolean language sql stable as $$
  select coalesce(btrim(p_nombre), '') <> ''
     and coalesce(btrim(current_setting('app.nombre', true)), '') <> ''
     and (
       lower(btrim(p_nombre)) = lower(btrim(current_setting('app.nombre', true)))
       or lower(btrim(p_nombre)) like lower(split_part(btrim(current_setting('app.nombre', true)), ' ', 1)) || '%'
       or lower(btrim(current_setting('app.nombre', true))) like lower(split_part(btrim(p_nombre), ' ', 1)) || '%'
       or lower(btrim(p_nombre)) = lower(coalesce(current_setting('app.uid', true), ''))
     );
$$;

do $$
declare t text; col text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> 'audit_log' loop
    execute format('drop policy if exists p_admin on public.%I', t);
    execute format('create policy p_admin on public.%I for all to sunsu_admin using (true) with check (true)', t);
  end loop;

  execute 'drop policy if exists p_staff on public.tickets';
  execute $p$ create policy p_staff on public.tickets for select to sunsu_rls using (
    public.app_acceso('tickets') = 'todos'
    or (public.app_acceso('tickets') = 'propio' and public.app_es_propio(atendido_por))
  ) $p$;

  execute 'drop policy if exists p_staff on public.rrhh_empleadas';
  execute $p$ create policy p_staff on public.rrhh_empleadas for select to sunsu_rls using (
    public.app_acceso('rol_pagos') = 'todos'
    or (public.app_acceso('rol_pagos') = 'propio' and (public.app_es_propio(nombre_app) or public.app_es_propio(apellidos_y_nombres)))
  ) $p$;

  execute 'drop policy if exists p_staff on public.rrhh_historial';
  execute $p$ create policy p_staff on public.rrhh_historial for select to sunsu_rls using (
    public.app_acceso('rol_pagos') = 'todos'
    or (public.app_acceso('rol_pagos') = 'propio' and public.app_es_propio(empleada))
  ) $p$;

  execute 'drop policy if exists p_staff on public.multas_descuentos';
  execute $p$ create policy p_staff on public.multas_descuentos for select to sunsu_rls using (
    public.app_acceso('comisiones') = 'todos'
    or (public.app_acceso('comisiones') = 'propio' and public.app_es_propio(cosmetologa))
  ) $p$;

  execute 'drop policy if exists p_staff on public.catalogo';
  execute $p$ create policy p_staff on public.catalogo for select to sunsu_rls using (public.app_acceso('productos') <> 'no') $p$;

  execute 'drop policy if exists p_staff on public.erp_productos';
  execute $p$ create policy p_staff on public.erp_productos for select to sunsu_rls using (public.app_acceso('productos') <> 'no') $p$;
  execute 'drop policy if exists p_staff on public.erp_stock';
  execute $p$ create policy p_staff on public.erp_stock for select to sunsu_rls using (public.app_acceso('inventario') <> 'no') $p$;
  execute 'drop policy if exists p_staff on public.erp_bodegas';
  execute $p$ create policy p_staff on public.erp_bodegas for select to sunsu_rls using (public.app_acceso('inventario') <> 'no' or public.app_acceso('inicio') <> 'no') $p$;
  execute 'drop policy if exists p_staff on public.erp_movimientos';
  execute $p$ create policy p_staff on public.erp_movimientos for select to sunsu_rls using (public.app_acceso('kardex') <> 'no' or public.app_acceso('inventario') <> 'no') $p$;

  select c.column_name into col from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'historial_comisiones'
     and c.column_name in ('empleada','nombre','cosm','cosmetologa','usuario')
   limit 1;
  if col is not null then
    execute 'drop policy if exists p_staff on public.historial_comisiones';
    execute format($p$ create policy p_staff on public.historial_comisiones for select to sunsu_rls using (
      public.app_acceso('comisiones') = 'todos'
      or (public.app_acceso('comisiones') = 'propio' and public.app_es_propio(%I))
    ) $p$, col);
  end if;
end $$;

do $$
declare r record;
begin
  for r in
    select table_name, column_name from information_schema.columns
    where table_schema = 'public'
      and column_name in ('precio_compra','utilidad','comi_producto_30','costo_promedio','costo_unit','costo_envase','costo_por_unidad')
  loop
    execute format('revoke select (%I) on public.%I from sunsu_rls', r.column_name, r.table_name);
  end loop;
end $$;

create or replace function public.app_read(p_uid text, p_rol text, p_nombre text, p_tabla text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cols text;
  rows jsonb;
  costo boolean;
begin
  if p_tabla !~ '^[a-z_][a-z0-9_]*$' then raise exception 'tabla invalida'; end if;
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = p_tabla) then
    raise exception 'tabla no existe';
  end if;
  perform set_config('app.uid', coalesce(p_uid, ''), true);
  perform set_config('app.rol', coalesce(p_rol, ''), true);
  perform set_config('app.nombre', coalesce(p_nombre, ''), true);
  perform set_config('app.user', coalesce(p_nombre, '') || ' (' || coalesce(p_uid, '') || ')', true);
  costo := p_rol in ('admin', 'super_admin', 'admin_master');
  select string_agg(quote_ident(c.column_name), ',') into cols
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = p_tabla
    and (costo or c.column_name not in ('precio_compra','utilidad','comi_producto_30','costo_promedio','costo_unit','costo_envase','costo_por_unidad','pin_hash','pin_salt'));
  execute 'set local role ' || case when costo then 'sunsu_admin' else 'sunsu_rls' end;
  execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from (select %s from public.%I) x', cols, p_tabla) into rows;
  execute 'reset role';
  return rows;
end $$;
revoke all on function public.app_read(text, text, text, text) from public, anon, authenticated;
grant execute on function public.app_read(text, text, text, text) to service_role;

-- app_write con las tablas nuevas. El actor queda en app.user dentro de la misma transacción.
create or replace function public.app_write(
  p_actor text, p_table text, p_op text, p_match jsonb, p_row jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  allowed text[] := array[
    'tickets','clientas_registro','clientas_antiguas','paquetes','gift_cards',
    'historial_ventas','catalogo','inventario_entradas','inventario_fisico',
    'proveedores','ordenes_compra','promos','propinas','envios_tarjetas',
    'roles_aprobados','multas_descuentos','permisos','caja_chica','log_acciones',
    'configuracion','cabina_inventario','cabina_bitacora','cabina_traspasos',
    'cabina_activos','cabina_protocolos','cabina_protocolo_pasos','cabina_consumos',
    'cabina_aperturas','cabina_ordenes','cabina_bajas','rrhh_empleadas','rrhh_historial',
    'cotizaciones','usuarios','sesiones','app_kv','app_archivos','inventario_base',
    'cosmetologas','ciclo_override','config_comisiones','app_modulos','login_intentos',
    'app_usuarios','gift_cards_digitales','seguimiento_memoria','tarjetas_enviadas',
    'wa_enviados','historial_comisiones','cabina_fotos','app_settings',
    'erp_bodegas','erp_productos','erp_producto_bodega','erp_stock','erp_proveedores',
    'erp_clientes','erp_rfq','erp_rfq_prov','erp_rfq_lineas','erp_oc','erp_oc_lineas',
    'erp_recepciones','erp_recepcion_lineas','erp_transferencias','erp_transferencia_lineas',
    'erp_conteos','erp_conteo_lineas','erp_ajustes','erp_ordenes_venta','erp_ov_lineas',
    'erp_tickets_procesados','erp_avisos','erp_servicios','erp_receta'
  ];
  col text; cols text[] := array[]::text[]; exprs text[] := array[]::text[];
  sets text[] := array[]::text[]; wh text[] := array[]::text[]; rec jsonb; q text;
begin
  if coalesce(btrim(p_actor), '') = '' then raise exception 'actor requerido'; end if;
  if p_table = 'erp_movimientos' and p_op = 'delete' then
    raise exception 'El kardex no se borra';
  end if;
  if not (p_table = any (allowed)) then raise exception 'tabla no permitida: %', p_table; end if;
  if p_op not in ('insert','update','delete') then raise exception 'op invalida'; end if;
  perform set_config('app.user', p_actor, true);
  if p_op = 'insert' then
    for col in select jsonb_object_keys(coalesce(p_row, '{}'::jsonb)) loop
      if col !~ '^[a-z_][a-z0-9_]*$' then raise exception 'columna invalida: %', col; end if;
      if (p_row -> col) = 'null'::jsonb then continue; end if;
      if not exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=p_table and c.column_name=col) then continue; end if;
      cols := cols || quote_ident(col);
      exprs := exprs || format('(jsonb_populate_record(null::public.%I, $1)).%I', p_table, col);
    end loop;
    if coalesce(array_length(cols, 1), 0) = 0 then raise exception 'insert vacio'; end if;
    q := format('insert into public.%I (%s) select %s returning to_jsonb(public.%I.*)', p_table, array_to_string(cols, ','), array_to_string(exprs, ','), p_table);
    execute q using p_row into rec;
    return rec;
  end if;
  if p_match is null or p_match = '{}'::jsonb then raise exception 'update/delete sin filtro'; end if;
  for col in select jsonb_object_keys(p_match) loop
    if col !~ '^[a-z_][a-z0-9_]*$' then raise exception 'columna invalida: %', col; end if;
    wh := wh || format('%I is not distinct from (jsonb_populate_record(null::public.%I, $2)).%I', col, p_table, col);
  end loop;
  if p_op = 'delete' then
    q := format('delete from public.%I where %s returning to_jsonb(public.%I.*)', p_table, array_to_string(wh, ' and '), p_table);
    execute q using null::jsonb, p_match into rec;
    return rec;
  end if;
  for col in select jsonb_object_keys(coalesce(p_row, '{}'::jsonb)) loop
    if col !~ '^[a-z_][a-z0-9_]*$' then raise exception 'columna invalida: %', col; end if;
    if col in ('id') then continue; end if;
    if not exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=p_table and c.column_name=col) then continue; end if;
    sets := sets || format('%I = (jsonb_populate_record(null::public.%I, $1)).%I', col, p_table, col);
  end loop;
  if coalesce(array_length(sets, 1), 0) = 0 then raise exception 'update vacio'; end if;
  q := format('update public.%I set %s where %s returning to_jsonb(public.%I.*)', p_table, array_to_string(sets, ','), array_to_string(wh, ' and '), p_table);
  execute q using p_row, p_match into rec;
  return rec;
end $$;
revoke all on function public.app_write(text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.app_write(text, text, text, jsonb, jsonb) to service_role;

select public.audit_attach_all();
