# Asistencia — reloj propio

Jibble se cae cada mes. Este módulo marca entrada, inicio de almuerzo, fin de almuerzo y salida desde el teléfono o el computador de recepción. Las horas del mes calendario entran a `getRolIndividual` / `rol_calcular` y sustituyen el timesheet de Jibble.

El SQL es `docs/supabase/pending/0010_asistencia.sql`. No va en `supabase/migrations`. `jibble_historial` se crea vacía: el coordinador importa el histórico aparte. La app no escribe esa tabla.

## Tablas

| Tabla | Para qué |
|---|---|
| `asistencia_config` | Una fila (`id = 1`). Radio, punto del spa, horario, gracia. |
| `asistencia_marcajes` | Cada marca. `ts` lo pone el servidor. Anular no borra. |
| `asistencia_auditoria` | Quién cambió una marca, una regla, un feriado o un permiso. Sin selfie. |
| `asistencia_feriados` | Fechas que se pagan como descanso. Nace vacía. Un admin las carga en la pantalla (fecha y nombre). |
| `jibble_historial` | Minutos ya clasificados por persona y fecha. Única `(persona, fecha)`. |

Los permisos y las vacaciones siguen en `public.permisos` (la pestaña PERMISOS). Una solicitud nueva entra como `PENDIENTE`. Solo admin o super_admin la pasa a `APROBADO` o `RECHAZADO`.

## Cómo se marca

1. Entrada, solo si no hay un turno abierto.
2. Inicio de almuerzo, una vez, después de la entrada.
3. Fin de almuerzo, solo después del inicio.
4. Salida, solo con el almuerzo ya cerrado.

La hora es `ctx.now` del servidor. El teléfono no puede atrasar la marca. Una corrección de admin manda la hora de Ecuador con offset, por ejemplo `2026-10-21T09:05:00-05:00`, y un motivo. Queda `antes` y `despues` en la auditoría, con el actor.

Cada marca pide las dos cosas: estar dentro del radio y una selfie. No hay un interruptor para apagarlas. El admin configura latitud, longitud y radio (150 m si no lo cambia). Si el punto del spa todavía no está guardado, la marca se rechaza con «Falta la ubicación del spa. Un admin la guarda en Asistencia.» Si la precisión del GPS es mayor que el doble del radio, también se rechaza. La distancia es haversine. Entrada 09:00, salida 18:00, jornada 8 h, gracia 10 min.

La selfie (jpeg, png o webp, máximo 1.5 MB) se sube al bucket privado `asistencia` de Storage. La fila guarda la ruta `asistencia/<usuario>/<fecha>/<id>-<tipo>.<ext>`, no los bytes y no una URL pública. `asis_foto` devuelve un enlace firmado de dos minutos a quien es dueña de la marca o a un admin. La auditoría no recibe la imagen.

Recepción marca con la sesión de quien está logueada (`origen` `telefono` o `recepcion`). Con la matriz en **propio** no puede fichar a una compañera. Un admin puede pasar `nombre`.

## Horas del rol

El período de horas es el mes calendario (día 1 al último), igual que `generarRolDePagos`. Las comisiones siguen del 26 al 25 y este módulo no las toca.

Por cada minuto en `America/Guayaquil`:

- Suplementarias: día de semana, después de la hora de salida y hasta medianoche, +50%. Tope 4 h al día y 12 h a la semana. El exceso queda en `suplExcesoMin` y no se paga.
- Extraordinarias: día de semana de 00:00 a 06:00, +100%. No las recorta `cuenta_antes`.
- Descanso: sábado, domingo y `asistencia_feriados`, +100%.
- Llegar antes de la hora de entrada, después de las 06:00, no se paga salvo `cuenta_antes`.
- El almuerzo se resta solo si existen inicio y fin. Si falta uno, `almuerzoPendiente` y no se inventa el descuento.
- Un turno abierto (entrada sin salida) cuenta como presente y no suma horas.
- Atraso = entrada − hora de entrada − gracia, mínimo 0, solo entre semana. Un permiso o vacación de día completo lo deja en cero. El atraso se informa y no se descuenta del sueldo.

`diasLaborados` no es el conteo de días con marca. Si el mes no tiene marcas, ni filas de `jibble_historial`, ni un permiso o vacación aprobado de día completo, `hayDatos` es falso y `getRolIndividual` no manda `p_dias_laborados`: el sueldo sale completo, igual que cuando Jibble no respondía. Pasar ~22 días hábiles recortaría el sueldo.

Si hay datos, la ventana empieza el primer día con actividad. Los días hábiles anteriores no son faltas (el módulo se enciende a mitad de mes). Un día hábil ya transcurrido, sin marca, que no es feriado y no está cubierto por un permiso o vacación aprobado de día completo, es una falta. Los días posteriores a hoy no son faltas: el rol de un mes todavía abierto no recorta el resto del mes. `diasLaborados` = días del mes − faltas.

Un día con marcaje propio gana sobre `jibble_historial`. Jibble solo llena un día sin marcaje. Esos minutos históricos no vuelven a pasar por el tope de 4 h y 12 h.

Un permiso es de día completo si es vacación, si las horas cubren la jornada, o si la fecha desde es anterior a la fecha hasta.

## Acciones

| Acción | Quién |
|---|---|
| `asis_marcar`, `asis_hoy`, `asis_periodo` | Quien tenga el módulo. En propio, solo su nombre. |
| `asis_config_guardar`, `asis_corregir`, `asis_permiso_resolver`, `asis_feriado` | admin y super_admin |
| `asis_foto` | La dueña de la marca, admin y super_admin. Enlace firmado, dos minutos. |
| `asis_permiso_solicitar` | La sesión. Un admin puede indicar `empleada`. |

`testDiasJibble` sigue en el edge como sonda del token. La pantalla de asistencia ya no lo llama.
