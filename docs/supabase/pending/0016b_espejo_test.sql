-- 0016b: el trigger espejo_origen (0013) pisaba origin='test' con 'beta'. Respeta 'test'. Idempotente.
create or replace function public.espejo_origen() returns trigger language plpgsql as $$
declare u text := coalesce(current_setting('app.user', true), '');
begin
  if u <> '' and u not in ('import','reimport') then
    if new.origin is distinct from 'test' then new.origin := 'beta'; end if;
    if new.sheet_row is not null and new.sheet_row > 0 then new.sheet_row := -nextval('public.beta_row_seq'); end if;
  end if;
  return new;
end $$;
