-- TK164 (Emilia t757u): nuevo tipo de movimiento de caja «consumo» (sale de la caja).
alter table public.beta_caja_movimientos drop constraint if exists beta_caja_movimientos_tipo_check;
alter table public.beta_caja_movimientos add constraint beta_caja_movimientos_tipo_check
  check (tipo = any (array['apertura','ingreso','gasto','consumo','deposito','propina_entrada','propina_pago','efectivo_ticket','ajuste','cuadre']));
