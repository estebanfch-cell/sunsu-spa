-- TK148: respaldo y (opcional) sincronización de tickets.cob / tickets.comp
-- para tickets ya pagados en beta_pagos. NO EJECUTAR en producción hasta
-- que Emilia/Esteban lo aprueben. Nunca entre :00 y :15.

-- 1) Backup de las filas afectadas (1923 y 1924, los únicos con beta_pagos al 19/11/2026).
create table if not exists _bak_tk148_tickets_cob_20261119 as
select id, so_num, cob, comp, comprobante, estimado, updated_at
from tickets
where so_num in ('TK-SO-1923', 'TK-SO-1924')
   or id in (1915, 646221);

-- 2) Tras revisar el backup, marcar cobrados (descomentar a mano):
-- update tickets
--    set cob = true,
--        comp = coalesce(nullif(comp, ''), 'Tarje:965')
--  where so_num = 'TK-SO-1923'
--    and (cob is distinct from true);
--
-- update tickets
--    set cob = true,
--        comp = coalesce(nullif(comp, ''), 'Tarje:970')
--  where so_num = 'TK-SO-1924'
--    and (cob is distinct from true);
