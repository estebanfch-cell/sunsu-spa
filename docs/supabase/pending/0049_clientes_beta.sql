-- 0049: Ficha de clienta de la beta (Emilia 17/11, como MineCore). SOLO AGREGA una tabla beta_* que el sync de la
-- hoja no toca. Guarda las correcciones de datos de la clienta y la baja (borrado lógico) hechas en la beta.
-- clientas_registro y la hoja no se tocan. app_beta_write ya permite beta_clientes (0048).
create table if not exists public.beta_clientes (
  key text primary key,
  datos jsonb not null default '{}'::jsonb,
  borrado boolean not null default false,
  borrado_motivo text,
  borrado_por text,
  borrado_at timestamptz,
  historial jsonb not null default '[]'::jsonb,
  actualizado_por text,
  updated_at timestamptz not null default now()
);
alter table public.beta_clientes enable row level security;
comment on table public.beta_clientes is 'Correcciones de la ficha de clienta y bajas hechas en la beta (key = c:<cédula> o n:<nombre>). Manda sobre clientas_registro en la beta.';
do $$
begin
  if exists (select 1 from pg_proc where proname = 'audit_trigger')
     and not exists (select 1 from pg_trigger where tgname = 'trg_audit' and tgrelid = 'public.beta_clientes'::regclass) then
    execute 'create trigger trg_audit after insert or update or delete on public.beta_clientes for each row execute function public.audit_trigger(''key'')';
  end if;
end $$;
