-- 0061: radio de geocerca de asistencia a 20 m (Emilia 18/11/2026).
-- SOLO actualiza radio_m. No toca lat, lng ni horarios.
-- Backup previo: backups/cutover-20261118/asistencia_config_antes_radio.json

update public.asistencia_config
   set radio_m = 20
 where radio_m is distinct from 20;
