-- TK61 (Emilia 18/11): paquetes anulados en la BETA (duplicados o ticket cancelado) y sesiones movidas entre
-- paquetes. Aditivo: trigger que vuelve a poner lo que dice beta_paquete_ajustes aunque la importación horaria
-- reescriba la fila desde la hoja. No toca la hoja.
--   datos.anulado = true           → orig.anulado + motivo/quién
--   datos.fijar   = {"uso4": true, "fecha_4": "…", "completo": true, …} → esas columnas
create or replace function public.beta_paquete_ajuste_marca()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare a record;
begin
  begin
    select * into a from public.beta_paquete_ajustes where paquete_id = new.id;
    if found then
      if coalesce(a.datos->>'anulado', '') = 'true' then
        new.orig := coalesce(new.orig, '{}'::jsonb) || jsonb_build_object(
          'anulado', true,
          'cancelado_motivo', coalesce(a.datos->>'anulado_motivo', ''),
          'cancelado_por_ticket', coalesce(a.datos->>'anulado_ticket', ''),
          'anulado_por', coalesce(a.datos->>'anulado_por', ''),
          'anulado_ts', coalesce(a.datos->>'anulado_ts', ''));
      end if;
      if jsonb_typeof(a.datos->'fijar') = 'object' then
        new := jsonb_populate_record(new, a.datos->'fijar');
      end if;
    end if;
  exception when others then
    return new;
  end;
  return new;
end $$;
drop trigger if exists zzy_paquetes_beta_ajuste on public.paquetes;
create trigger zzy_paquetes_beta_ajuste before insert or update on public.paquetes
  for each row execute function public.beta_paquete_ajuste_marca();
