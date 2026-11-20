-- TK163 · Portal de clientas y proveedores en la app Sunsu (Emilia 20/11, t741u/t742u/t744u).
-- Cuentas propias del portal (no tocan app_usuarios / beta_credenciales del equipo). Cada cuenta queda atada
-- para siempre a UNA clienta (cliente_key + código) o a UN proveedor (proveedor_id): el vínculo no se cambia.
-- Solo el Edge Function (service role) lee/escribe: RLS activo y sin políticas para anon/authenticated.
create table if not exists public.beta_portal_cuentas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('cliente','proveedor')),
  email text not null,
  pass_hash text, pass_salt text, iteraciones integer,
  nombre text, cedula text, telefono text, nacimiento date,
  cliente_key text, cliente_codigo text,
  proveedor_id uuid, proveedor_fila integer, proveedor_familia text,
  estado text not null default 'pendiente_email' check (estado in ('pendiente_email','revision','activa','rechazada','invitada')),
  vinculo text check (vinculo in ('existente','nuevo')),
  coincidencia jsonb not null default '{}'::jsonb,
  email_verificado_at timestamptz,
  verif_hash text, verif_exp timestamptz, verif_intentos integer not null default 0,
  intentos integer not null default 0, bloqueado_hasta timestamptz,
  invitado_por text, revisado_por text, revisado_at timestamptz, nota_revision text,
  ultimo_login timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint portal_vinculo_ck check ((tipo = 'cliente' and cliente_key is not null) or (tipo = 'proveedor' and proveedor_id is not null))
);
create unique index if not exists beta_portal_cuentas_email_uq on public.beta_portal_cuentas (lower(email));
create index if not exists beta_portal_cuentas_cli_ix on public.beta_portal_cuentas (cliente_key);
create index if not exists beta_portal_cuentas_prov_ix on public.beta_portal_cuentas (proveedor_id);

-- El vínculo es permanente: tipo, clienta y proveedor no se cambian nunca.
create or replace function public.beta_portal_vinculo_fijo() returns trigger language plpgsql as $$
begin
  if new.tipo is distinct from old.tipo
     or new.cliente_key is distinct from old.cliente_key
     or (old.cliente_codigo is not null and new.cliente_codigo is distinct from old.cliente_codigo)
     or new.proveedor_id is distinct from old.proveedor_id then
    raise exception 'El vínculo de la cuenta (clienta/proveedor) no se puede cambiar';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists beta_portal_vinculo_fijo_t on public.beta_portal_cuentas;
create trigger beta_portal_vinculo_fijo_t before update on public.beta_portal_cuentas
  for each row execute function public.beta_portal_vinculo_fijo();

create table if not exists public.beta_portal_sesiones (
  token text primary key,
  cuenta_id uuid not null references public.beta_portal_cuentas(id) on delete cascade,
  exp timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists beta_portal_sesiones_cuenta_ix on public.beta_portal_sesiones (cuenta_id);

-- Sugerencias del proveedor (precio, descuento, beneficio por volumen): nada se aplica solo; el admin aprueba o rechaza.
create table if not exists public.beta_portal_propuestas (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid references public.beta_portal_cuentas(id) on delete set null,
  proveedor_id uuid not null,
  familia text,
  tipo text not null check (tipo in ('precio','descuento','beneficio')),
  producto_id uuid, sku text, producto_nombre text,
  detalle jsonb not null default '{}'::jsonb,
  mensaje text,
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  revisado_por text, revisado_at timestamptz, nota_admin text,
  creado_por text,
  created_at timestamptz not null default now()
);
create index if not exists beta_portal_propuestas_estado_ix on public.beta_portal_propuestas (estado, created_at desc);

alter table public.beta_portal_cuentas enable row level security;
alter table public.beta_portal_sesiones enable row level security;
alter table public.beta_portal_propuestas enable row level security;
revoke all on public.beta_portal_cuentas, public.beta_portal_sesiones, public.beta_portal_propuestas from anon, authenticated;

-- app_beta_write: permite las 3 tablas nuevas (misma función, lista ampliada).
CREATE OR REPLACE FUNCTION public.app_beta_write(p_actor text, p_table text, p_op text, p_match jsonb, p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  allowed text[] := array['beta_conteos','beta_conteo_lineas','beta_notificaciones','beta_transferencias','beta_transferencia_lineas','beta_ajustes','beta_ajuste_lineas','beta_stock','beta_stock_movimientos','beta_tickets','beta_ticket_lineas','beta_clientes','beta_cliente_notas',
    'beta_acuity_calendars','beta_citas_ticket','beta_ticket_envios','beta_ventas','beta_venta_lineas','beta_pagos','beta_caja_movimientos','beta_caja_cierres',
    'beta_paquetes','beta_paquete_usos','beta_gift_cards','beta_gift_movimientos','beta_permisos_usuario','beta_ticket_flags','beta_ticket_cancelados','beta_aperturas','beta_paquete_ajustes','beta_multa_tipos','beta_multas','beta_cliente_documentos','beta_credenciales','beta_gift_ajustes','beta_gift_documentos','beta_cliente_alias','beta_oc_cotizaciones','beta_consig_restock','beta_proveedores_ficha','beta_actas','beta_migo_facturas_vivo','beta_migo_importes','beta_cuadre_link','beta_migo_borradores',
    'beta_rol_publicaciones','beta_empleados','beta_iess_descuentos','beta_empleado_docs','beta_roles','beta_roles_log','beta_asistencia_horas_mes','beta_asistencia_horas_log','beta_ticket_snaps',
    'beta_conteo_secciones','beta_conteo_plan','beta_conteo_zonas','erp_sububicaciones','beta_sububicaciones','beta_promociones','beta_consig_precios','beta_portal_cuentas','beta_portal_sesiones','beta_portal_propuestas'];
  col text; cols text[] := array[]::text[]; exprs text[] := array[]::text[];
  sets text[] := array[]::text[]; wh text[] := array[]::text[]; rec jsonb; q text;
begin
  if coalesce(btrim(p_actor), '') = '' then raise exception 'actor requerido'; end if;
  if p_table in ('beta_stock_movimientos','beta_pagos','beta_caja_movimientos','beta_caja_cierres','beta_paquete_usos','beta_gift_movimientos') and p_op = 'delete' then
    raise exception 'Los movimientos no se borran (se anulan con otro movimiento)';
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
end
$function$
;
