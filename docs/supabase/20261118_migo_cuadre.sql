-- 20261118_migo_cuadre.sql
-- Cuadre automático (solo lectura de Migo): facturas vivas, vínculo ticket↔factura,
-- log de imports y borradores de ticket cuando la factura llega antes que el ticket.
-- Aditivo: no toca tickets históricos, Sheets ni Apps Script.
-- No guarda cédulas, teléfonos ni correos.

create table if not exists public.beta_migo_facturas_vivo (
  factura text primary key,
  seq int not null,
  fecha date not null,
  hora text,
  cliente text not null default '',
  total numeric(12,2) not null default 0,
  subtotal numeric(12,2),
  descuento numeric(12,2),
  iva numeric(12,2),
  forma text,
  lineas jsonb not null default '[]'::jsonb,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists beta_migo_facturas_vivo_fecha_idx on public.beta_migo_facturas_vivo (fecha);
create index if not exists beta_migo_facturas_vivo_seq_idx on public.beta_migo_facturas_vivo (seq);

create table if not exists public.beta_migo_importes (
  id bigserial primary key,
  fecha_desde date,
  fecha_hasta date,
  n_facturas int not null default 0,
  n_nuevas int not null default 0,
  n_actualizadas int not null default 0,
  max_seq int,
  fuente text,
  actor text,
  imported_at timestamptz not null default now()
);

create table if not exists public.beta_cuadre_link (
  ticket_id bigint primary key,
  factura text not null,
  tipo text not null,
  confianza text not null,
  diferencia_monto numeric(12,2),
  diferencia_fecha int,
  estado text not null,
  motivo text,
  cliente_migo text,
  total_factura numeric(12,2),
  total_tickets numeric(12,2),
  updated_at timestamptz not null default now()
);
create index if not exists beta_cuadre_link_factura_idx on public.beta_cuadre_link (factura);

create table if not exists public.beta_migo_borradores (
  factura text primary key,
  fecha date not null,
  cliente text not null default '',
  total numeric(12,2) not null default 0,
  forma text,
  lineas jsonb not null default '[]'::jsonb,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','asignado','aprobado','vinculado','descartado')),
  asignado_a text,
  asignado_por text,
  assigned_at timestamptz,
  acuity_appointment_id text,
  datos jsonb not null default '{}'::jsonb,
  ticket_id bigint,
  ticket_clave text,
  aprobado_por text,
  aprobado_at timestamptz,
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists beta_migo_borradores_estado_idx on public.beta_migo_borradores (estado);
create index if not exists beta_migo_borradores_asig_idx on public.beta_migo_borradores (asignado_a) where estado = 'asignado';

comment on table public.beta_migo_facturas_vivo is
  'Facturas Migo del período vivo (import horario, solo lectura). Solo nombre del cliente, sin cédulas/teléfonos.';
comment on table public.beta_migo_importes is
  'Log de cada import de facturas Migo (quién, rango, máximos). No guarda datos de clientas.';
comment on table public.beta_cuadre_link is
  'Vínculo ticket ↔ factura Migo (por número o por nombre+fecha+monto).';
comment on table public.beta_migo_borradores is
  'Borrador de ticket prefijado cuando la factura Migo llega antes que el ticket. Estado Pendiente de aprobar; no cuenta en comisiones ni inventario hasta aprobarse.';

alter table public.beta_migo_facturas_vivo enable row level security;
alter table public.beta_migo_importes enable row level security;
alter table public.beta_cuadre_link enable row level security;
alter table public.beta_migo_borradores enable row level security;

grant select on public.beta_migo_facturas_vivo, public.beta_migo_importes, public.beta_cuadre_link, public.beta_migo_borradores to anon, authenticated, service_role;
grant insert, update, delete, references, trigger, truncate on public.beta_migo_facturas_vivo, public.beta_migo_importes, public.beta_cuadre_link, public.beta_migo_borradores to service_role;
grant usage, select on sequence public.beta_migo_importes_id_seq to service_role;

drop policy if exists beta_migo_facturas_vivo_select on public.beta_migo_facturas_vivo;
create policy beta_migo_facturas_vivo_select on public.beta_migo_facturas_vivo for select to anon, authenticated, service_role using (true);
drop policy if exists beta_migo_importes_select on public.beta_migo_importes;
create policy beta_migo_importes_select on public.beta_migo_importes for select to anon, authenticated, service_role using (true);
drop policy if exists beta_cuadre_link_select on public.beta_cuadre_link;
create policy beta_cuadre_link_select on public.beta_cuadre_link for select to anon, authenticated, service_role using (true);
drop policy if exists beta_migo_borradores_select on public.beta_migo_borradores;
create policy beta_migo_borradores_select on public.beta_migo_borradores for select to anon, authenticated, service_role using (true);

do $t$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = 'public.beta_migo_facturas_vivo'::regclass) then
    execute 'create trigger trg_audit after insert or update or delete on public.beta_migo_facturas_vivo for each row execute function public.audit_trigger(''factura'')';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = 'public.beta_cuadre_link'::regclass) then
    execute 'create trigger trg_audit after insert or update or delete on public.beta_cuadre_link for each row execute function public.audit_trigger(''ticket_id'')';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = 'public.beta_migo_borradores'::regclass) then
    execute 'create trigger trg_audit after insert or update or delete on public.beta_migo_borradores for each row execute function public.audit_trigger(''factura'')';
  end if;
end $t$;

-- app_beta_write: lista vigente en 20261117_beta_promociones_allow.sql + tablas de este módulo.
CREATE OR REPLACE FUNCTION public.app_beta_write(p_actor text, p_table text, p_op text, p_match jsonb, p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  allowed text[] := array['beta_conteos','beta_promociones','beta_conteo_lineas','beta_notificaciones','beta_transferencias','beta_transferencia_lineas','beta_ajustes','beta_ajuste_lineas','beta_stock','beta_stock_movimientos','beta_tickets','beta_ticket_lineas','beta_clientes','beta_cliente_notas',
    'beta_acuity_calendars','beta_citas_ticket','beta_ticket_envios','beta_ventas','beta_venta_lineas','beta_pagos','beta_caja_movimientos','beta_caja_cierres',
    'beta_paquetes','beta_paquete_usos','beta_gift_cards','beta_gift_movimientos','beta_permisos_usuario','beta_ticket_flags','beta_ticket_cancelados','beta_aperturas','beta_paquete_ajustes','beta_multa_tipos','beta_multas','beta_cliente_documentos','beta_credenciales','beta_pagos','beta_caja_movimientos','beta_caja_cierres','beta_gift_ajustes','beta_gift_documentos','beta_cliente_alias','beta_oc_cotizaciones','beta_consig_restock','beta_actas',
    'beta_migo_facturas_vivo','beta_migo_importes','beta_cuadre_link','beta_migo_borradores'];
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
end $function$
;
