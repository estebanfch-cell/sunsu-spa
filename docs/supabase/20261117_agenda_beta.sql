-- 0050: Detalle de ticket v2 (datos editables, costos, marcas por corregir, envíos de reporte) + Agenda (Acuity). SOLO AGREGA tablas beta_* y amplía la lista de
-- app_beta_write (función nuestra de 0045/0048) con las tablas de este módulo y de los siguientes de la cola
-- (ventas/pagos/caja, paquetes, gift cards, permisos por usuario), para no reemplazarla en cada PR. Los
-- movimientos de dinero, de paquete y de gift card no se pueden borrar.
create table if not exists public.beta_acuity_calendars (
  calendar_id bigint primary key,
  nombre text not null,
  persona text,
  cosmetologa_id text,
  activo boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.beta_acuity_calendars (calendar_id, nombre, persona, cosmetologa_id, activo) values
  (11689550, 'Andrea', 'Andrea Robles', 'andrea', true),
  (12796672, 'Daniela', 'Daniela Mora', 'daniela', true),
  (14600750, 'Vacante', null, null, false)
on conflict (calendar_id) do nothing;
create table if not exists public.beta_citas_ticket (
  appointment_id bigint primary key,
  ticket_clave text not null,
  fecha date,
  calendar_id bigint,
  etiqueta text,
  por text,
  created_at timestamptz not null default now()
);
create index if not exists beta_citas_ticket_clave on public.beta_citas_ticket (ticket_clave);
create table if not exists public.beta_ticket_envios (
  id text primary key,
  ticket_clave text not null,
  tipo text not null check (tipo in ('facial','paquete')),
  telefono_fin text,
  por text not null,
  created_at timestamptz not null default now()
);
create index if not exists beta_ticket_envios_clave on public.beta_ticket_envios (ticket_clave);
alter table public.beta_acuity_calendars enable row level security;
alter table public.beta_citas_ticket enable row level security;
alter table public.beta_ticket_envios enable row level security;
comment on table public.beta_acuity_calendars is 'Calendario de Acuity → persona del spa (cosmetóloga). Lo edita admin en la Agenda de la beta.';
comment on table public.beta_citas_ticket is 'Cita de Acuity ↔ ticket creado desde la Agenda de la beta (el sync de la hoja no lo toca).';
comment on table public.beta_ticket_envios is 'Envíos por WhatsApp del reporte facial o de paquete desde el detalle de ticket (beta).';
alter table public.beta_tickets add column if not exists datos jsonb not null default '{}'::jsonb;
alter table public.beta_tickets add column if not exists costos_nc_tipo text check (costos_nc_tipo in ('%','$'));
alter table public.beta_tickets add column if not exists costos_nc_valor numeric not null default 0;
comment on column public.beta_tickets.datos is 'Cabecera corregida en la beta (factura completa, clienta, CI, email, teléfono, atendió, notas, fecha de regreso…). Manda sobre la hoja en la beta.';
create table if not exists public.beta_ticket_flags (
  id text primary key,
  ticket_id bigint,
  ticket_clave text,
  motivo text not null,
  detalle text,
  factura text,
  fuente text not null default 'manual',
  resuelto boolean not null default false,
  resuelto_por text,
  resuelto_at timestamptz,
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists beta_ticket_flags_tk on public.beta_ticket_flags (ticket_id) where not resuelto;
alter table public.beta_ticket_flags enable row level security;
comment on table public.beta_ticket_flags is 'Tickets por corregir (no cuadran con la facturación). fuente=migo los escribe el cruce con Migo; admin los marca resueltos.';
insert into public.beta_ticket_flags (id, ticket_id, ticket_clave, motivo, detalle, factura, fuente)
select v.id, v.tid, (select coalesce(nullif(t.so_num,''), 'r' || t.sheet_row) from public.tickets t where t.id = v.tid), v.motivo, v.detalle, v.factura, 'migo'
from (values
  ('migo:1820:sinfac', 1820, 'Sin factura', 'No hay factura en Migo para esta clienta, fecha y monto. Facial Reset $95 del 9/11, sin # de factura ni cobro en Sunsu.', null),
  ('migo:1819:2910', 1819, 'Gift card 26-092 no cuadra', 'Uso de gift card 26-092 (1 Facial Geisha) en un Facial Peeling Marino: ticket $58.66 vs factura $47.16 (+$11.50).', '001-001-000002910'),
  ('migo:1750:2857', 1750, 'Diferencia de monto', 'Factura con descuento $12.39 ($95.75) vs ticket $93.50 (−$2.25); fecha distinta.', '001-001-000002857'),
  ('migo:1803:2900', 1803, 'Diferencia de monto', 'Factura a nombre de BENMAR& S.A.S. con descuento $149.18 ($84.94) vs ticket $81 (−$3.94).', '001-001-000002900'),
  ('migo:1818:2909', 1818, 'Diferencia de monto', 'Paquete Reset 3x1: factura $235.31 (descuento $49.72) vs ticket $243.50 (+$8.19).', '001-001-000002909'),
  ('migo:1854:2936', 1854, 'Diferencia de monto', 'Ticket $112.99 vs factura $107.99 (+$5.00).', '001-001-000002936'),
  ('migo:1872:2945', 1872, 'Diferencia de monto', 'Una factura cubre 2 tickets (#1872, #1873): $114.99 vs factura $144.99 (faltan $30).', '001-001-000002945'),
  ('migo:1873:2945', 1873, 'Diferencia de monto', 'Una factura cubre 2 tickets (#1872, #1873): $114.99 vs factura $144.99 (faltan $30).', '001-001-000002945'),
  ('migo:1831:2918', 1831, 'Diferencia de monto', 'Una factura cubre 2 tickets (#1831, #1832): $95 vs factura $132.82 (faltan $37.82).', '001-001-000002918'),
  ('migo:1832:2918', 1832, 'Diferencia de monto', 'Una factura cubre 2 tickets (#1831, #1832): $95 vs factura $132.82 (faltan $37.82).', '001-001-000002918')
) as v(id, tid, motivo, detalle, factura)
on conflict (id) do nothing;

do $$
declare t text;
begin
  if exists (select 1 from pg_proc where proname = 'audit_trigger') then
    if not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = 'public.beta_acuity_calendars'::regclass) then
      execute 'create trigger trg_audit after insert or update or delete on public.beta_acuity_calendars for each row execute function public.audit_trigger(''calendar_id'')';
    end if;
    if not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = 'public.beta_citas_ticket'::regclass) then
      execute 'create trigger trg_audit after insert or update or delete on public.beta_citas_ticket for each row execute function public.audit_trigger(''appointment_id'')';
    end if;
    if not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = 'public.beta_ticket_flags'::regclass) then
      execute 'create trigger trg_audit after insert or update or delete on public.beta_ticket_flags for each row execute function public.audit_trigger(''id'')';
    end if;
    if not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = 'public.beta_ticket_envios'::regclass) then
      execute 'create trigger trg_audit after insert or update or delete on public.beta_ticket_envios for each row execute function public.audit_trigger(''id'')';
    end if;
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.app_beta_write(p_actor text, p_table text, p_op text, p_match jsonb, p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  allowed text[] := array['beta_conteos','beta_conteo_lineas','beta_notificaciones','beta_transferencias','beta_transferencia_lineas','beta_ajustes','beta_ajuste_lineas','beta_stock','beta_stock_movimientos','beta_tickets','beta_ticket_lineas','beta_clientes','beta_cliente_notas',
    'beta_acuity_calendars','beta_citas_ticket','beta_ticket_envios','beta_ventas','beta_venta_lineas','beta_pagos','beta_caja_movimientos','beta_caja_cierres',
    'beta_paquetes','beta_paquete_usos','beta_gift_cards','beta_gift_movimientos','beta_permisos_usuario','beta_ticket_flags'];
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
end $function$;

revoke all on function public.app_beta_write(text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.app_beta_write(text, text, text, jsonb, jsonb) to service_role;
