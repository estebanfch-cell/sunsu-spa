-- APLICAR en el proyecto Supabase. No poner este archivo en supabase/migrations.
-- 0025: el catálogo de Modo prueba lleva origin = 'test' y la purga lo borra.
-- prueba_purgar es el de 0024 más catalogo. No borra audit_log.

alter table public.catalogo add column if not exists origin text;

create or replace function public.prueba_purgar(p_actor text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  tablas text[] := array[
    'tickets','erp_ordenes_venta','erp_ov_lineas','cotizaciones',
    'erp_oc','erp_oc_lineas','erp_recepciones','erp_recepcion_lineas',
    'erp_movimientos','gift_card_movimientos','gift_cards','clientas_registro',
    'asistencia_marcajes','asistencia_auditoria','permisos','paquetes',
    'erp_rfq','erp_rfq_lineas','erp_rfq_prov',
    'erp_transferencias','erp_transferencia_lineas',
    'erp_conteos','erp_conteo_lineas','erp_ajustes','erp_avisos',
    'erp_tickets_procesados','erp_clientes','erp_proveedores','erp_productos',
    'log_acciones','ordenes_compra','caja_chica','propinas','multas_descuentos',
    'app_archivos','cabina_ordenes','roles_aprobados','historial_comisiones',
    'erp_stock','erp_locales','erp_consignacion_consumo',
    'solicitudes_cambio','catalogo'
  ];
  t text;
  n int;
  total int := 0;
  counts jsonb := '{}'::jsonb;
  sr int;
begin
  if coalesce(btrim(p_actor), '') = '' then
    raise exception 'actor requerido';
  end if;
  perform set_config('app.user', p_actor, true);
  foreach t in array tablas loop
    if to_regclass('public.' || t) is null then continue; end if;
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = t and c.column_name = 'origin'
    ) then continue; end if;
    execute format('delete from public.%I where origin = %L', t, 'test');
    get diagnostics n = row_count;
    if n > 0 then
      counts := counts || jsonb_build_object(t, n);
      total := total + n;
    end if;
  end loop;
  select coalesce(max(sheet_row), 0) + 1 into sr from public.log_acciones;
  insert into public.log_acciones (sheet_row, fecha, usuario, accion, detalle, orig)
  values (
    sr,
    to_char(now() at time zone 'America/Guayaquil', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    p_actor,
    'PURGA PRUEBA',
    counts::text,
    jsonb_build_object('accion', 'PURGA PRUEBA', 'detalle', counts, 'usuario', p_actor, 'borradas', total)
  );
  return jsonb_build_object('ok', true, 'borradas', total, 'tablas', counts);
end $$;

revoke all on function public.prueba_purgar(text) from public, anon, authenticated;
grant execute on function public.prueba_purgar(text) to service_role;
