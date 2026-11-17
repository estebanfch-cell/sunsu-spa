-- 🔗 Clientas duplicadas (Emilia 17/11). Aditivo: tabla nueva, la hoja y clientas_registro no se tocan.
-- tipo alias: la clienta «clave» se muestra como «destino» (unión a mano). separar: saca una variante vieja
-- (p. ej. c:…001) de su grupo automático por cédula. no_dup: «no son la misma» (clave|destino).
-- Reversible: deshecho_at / deshecho_por (nunca se borra la fila).
create table if not exists public.beta_cliente_alias (
  id text primary key,
  tipo text not null check (tipo in ('alias', 'separar', 'no_dup')),
  clave text not null,
  destino text,
  motivo text,
  por text,
  created_at timestamptz not null default now(),
  deshecho_at timestamptz,
  deshecho_por text
);
create index if not exists beta_cliente_alias_clave on public.beta_cliente_alias (clave) where deshecho_at is null;
alter table public.beta_cliente_alias enable row level security;
comment on table public.beta_cliente_alias is 'Clientas unidas / separadas / «no son la misma» desde Clientes › Duplicados (beta). Reversible con deshecho_at.';
