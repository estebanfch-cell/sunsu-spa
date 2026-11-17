-- 🛒 Compras v2 (Emilia 17/11). Aditivo: cotizaciones de proveedor (antes «Borrador») y datos del pago.
create table if not exists public.beta_oc_cotizaciones (
  id text primary key,
  numero text unique,
  proveedor_id uuid,
  fecha date,
  lineas jsonb not null default '[]'::jsonb,
  con_iva boolean not null default true,
  nota text,
  numero_prov text,
  estado text not null default 'abierta' check (estado in ('abierta', 'convertida', 'anulada')),
  oc_id uuid,
  creado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.beta_oc_cotizaciones enable row level security;
comment on table public.beta_oc_cotizaciones is 'Cotización de proveedor (beta): lo que antes era la OC en Borrador; se convierte en OC-AAAA-NNNN.';
alter table public.erp_oc_pagos add column if not exists beta_banco text;
alter table public.erp_oc_pagos add column if not exists beta_referencia text;
