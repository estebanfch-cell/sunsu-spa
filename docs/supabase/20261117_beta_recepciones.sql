-- 📥 Recepciones (Emilia 17/11). Aditivo: origen del producto y «No recibido» deshacible por 1 hora.
alter table public.erp_productos add column if not exists beta_origen text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'erp_productos_beta_origen_chk') then
    alter table public.erp_productos add constraint erp_productos_beta_origen_chk check (beta_origen is null or beta_origen in ('consignacion', 'propio'));
  end if;
end $$;
comment on column public.erp_productos.beta_origen is 'Beta: Consignación | Propio. Vacío = lo que diga el proveedor (HT/AS/ML/PH/JN consignación, el resto propio).';
alter table public.erp_oc_lineas add column if not exists beta_no_recibido_at timestamptz;
alter table public.erp_oc_lineas add column if not exists beta_no_recibido_por text;
alter table public.erp_oc_lineas add column if not exists beta_no_recibido_qty numeric;
