-- Préstamos: plan por monto de cuota o por número, residuo (sumar al último / cuota extra),
-- y cuotas ya pagadas para registrar un préstamo a mitad de camino.
-- Aditivo e idempotente. Aplicar con la Management API (database/query).

alter table public.beta_rol_descuentos
  add column if not exists modo text;

alter table public.beta_rol_descuentos
  add column if not exists monto_cuota numeric(12,2);

alter table public.beta_rol_descuentos
  add column if not exists resto_modo text;

alter table public.beta_rol_descuentos
  add column if not exists cuotas_pagadas int not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'beta_rol_descuentos_modo_chk'
  ) then
    alter table public.beta_rol_descuentos
      add constraint beta_rol_descuentos_modo_chk
      check (modo is null or modo in ('numero_cuotas','monto_cuota'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'beta_rol_descuentos_resto_chk'
  ) then
    alter table public.beta_rol_descuentos
      add constraint beta_rol_descuentos_resto_chk
      check (resto_modo is null or resto_modo in ('cuota_extra','sumar_ultimo'));
  end if;
end$$;

comment on column public.beta_rol_descuentos.modo is 'numero_cuotas (reparte el total) o monto_cuota (cuotas del valor indicado).';
comment on column public.beta_rol_descuentos.monto_cuota is 'Monto de cada cuota cuando modo = monto_cuota.';
comment on column public.beta_rol_descuentos.resto_modo is 'cuota_extra o sumar_ultimo, cuando el total no es múltiplo exacto del monto de cuota.';
comment on column public.beta_rol_descuentos.cuotas_pagadas is 'Cuotas ya descontadas en un rol anterior (p.ej. 1 si la cuota 1 ya se cobró en octubre).';
