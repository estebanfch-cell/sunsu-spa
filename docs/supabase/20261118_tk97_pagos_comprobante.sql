-- TK97: foto del voucher / comprobante enlazada al pago (additive).
-- El archivo sigue en app_archivos (y, si se puede, una copia en el bucket Storage «comprobantes»).
alter table public.beta_pagos add column if not exists comprobante_id text;
