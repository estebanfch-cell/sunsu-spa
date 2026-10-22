# Sistema Central beta

La operación diaria sigue en [sunsu.html](../sunsu.html). Esta beta es una app aparte, con menú lateral y un botón **Crear**, sobre Supabase (`heuolwxyxoezkewyufrl`). Después del merge se abre en `https://app.sunsuspa.com/beta.html`.

El servicio worker sigue en `/sw.js` (caché `sunsu-beta-2026-10-22-VERCOMO`) y se registra con `scope: "/beta"`. Las pantallas salen de `beta-screens.js`, el mismo marcado que `sunsu.html`. En escritorio el menú es la barra lateral (logo chico, contenido a todo el ancho). En el teléfono no hay barra lateral: Ventas, Inventario, el + de Crear, Bodega (stock Venta y Cabina) y Compras viven en una barra fija abajo, y ••• abre el resto agrupado por módulo (Personal, Gift cards y paquetes, Citas, Seguimiento / Recepción, Caja chica, Bitácora de esterilización). El reloj es una pastilla dorada o blanca: en el teléfono queda junto al + y en el escritorio en la barra de arriba. Muestra Entrada o Salida y, si ya marcó, el tiempo transcurrido. Un admin no ve esa pastilla; si tiene ficha de empleada, marca desde Personal. El dashboard de admin no trae el bloque de citas: las citas quedan en la cuenta de la cosmetóloga. Ver como… deja a un admin mirar menús, dashboard y Personal como otra persona, con el letrero Viendo como X — Salir, y sin poder guardar. Un script en la raíz puede estrechar el alcance; moverlo a `/beta/sw.js` dejaría `/beta.html` fuera de ese alcance. Si el navegador todavía tiene el worker viejo con alcance `/`, ese script se desregistra y solo borra cachés `sunsu-beta*`. No sirve `beta.html` para otra ruta. `beta.html` hace lo mismo una vez al abrir: desregistra cualquier worker de `sw.js` cuyo scope sea la raíz. El manifest queda en `/beta.html` para que un acceso directo no tome el origen entero. El ícono de iOS va embebido en `beta.html`.

## Plan

El caché del worker es `sunsu-beta-2026-10-22-VERCOMO`. `beta-screens.js?v=20261022vercomo`.

La estructura nueva sigue el esquema de Minecore, con las reglas de Sunsu encima:

1. Menú por rol y botón Crear (ticket = orden de venta, cotización, compra, producto, clienta, proveedor, transferencia).
2. Catálogo con uso obligatorio: `venta`, `cabina` o `ambos`. El precio de venta se edita; el costo solo lo ven admin y super_admin.
3. Dos bodegas fijas: Venta `11111111-1111-4111-8111-111111111111` y Cabina `22222222-2222-4222-8222-222222222222`.
4. Compras: cotización (RFQ) → orden de compra → recepción. La recepción postea el kardex. Cada línea elige bodega. Un producto de cabina no entra a Venta: el servidor responde error, no lo mueve de bodega. Uso `ambos` sin bodega también es error.
5. El ticket descuenta Venta. Un servicio con receta descuenta Cabina (consumo, no venta). El mismo `ticket_ref` no descuenta dos veces.
6. Conteos, transferencias, reorden y kardex. Un movimiento no se borra: deshacer escribe el inverso.
7. Comisiones, paquetes, gift cards, rol de pagos, asistencia, bitácora y cabina siguen las reglas de `REGLAS_NEGOCIO.md`. La bandera `es_cosmetologa` es el N de paquetes y no se deduce del nombre del rol.

La matriz de menú está en [PERMISOS.md](supabase/PERMISOS.md). Resumen: cosmetóloga, asistente, recepción y gerencia ven solo sus tickets, sus comisiones, su rol y su asistencia. No ven costos. Admin y super_admin ven todo. Solo super_admin edita la matriz, y no puede soltar `ver_costos` ni el módulo Permisos. Recepción y gerencia arrancan con tickets en **propio**; si el mostrador debe ver el día completo, se cambia esa celda a **todos** sin otro deploy.

## Publicar

0001–0006 y **0008 ya están aplicados**. No volver a correrlos. 0008 dejó `app_usuarios` (PIN bcrypt, `intentos_fallidos`, `verificar_pin`), `gift_cards_digitales`, `seguimiento_memoria`, `tarjetas_enviadas`, `wa_enviados`, `historial_comisiones`, `cabina_fotos`, `app_settings`, y las secuencias `ticket_seq` (desde 1566), `oc_seq_2026` (79) y `cot_seq`.

Desde la raíz del repo, con la CLI ya logueada:

```bash
supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0007_beta_api.sql
supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0009_erp_permisos.sql
supabase functions deploy api --project-ref heuolwxyxoezkewyufrl --no-verify-jwt
```

Después del merge de los arreglos urgentes, con 0007/0009/0010 ya aplicados:

```bash
supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0009b_compat_0008.sql
supabase functions deploy api --project-ref heuolwxyxoezkewyufrl --no-verify-jwt
```

`0009b_compat_0008.sql` copia `role`→`rol` y `name`→`nombre` cuando esas columnas existen y el destino está vacío, re-apunta `sesiones.uid` a `app_usuarios` (la FK solo si el tipo es `text` y no deja huérfanas), deja `app_acceso` como security definer y `app_read` como security invoker solo para `service_role`. El cambio de PIN usa `pin_coincide`, `pin_en_uso` y `hash_pin_bcrypt`. Publicar también `sw.js`, `beta.html` y `manifest.webmanifest`: el worker de alcance raíz que ya está en los teléfonos se reemplaza al pedir `/sw.js`.

La asistencia propia va en un SQL aparte, después de 0009:

```bash
supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0010_asistencia.sql
supabase functions deploy api --project-ref heuolwxyxoezkewyufrl --no-verify-jwt
```

`0010_asistencia.sql` crea las tablas del reloj, deja `jibble_historial` vacía y vuelve a publicar `app_write` con esas tablas en la lista blanca. Las reglas del cálculo están en [ASISTENCIA.md](supabase/ASISTENCIA.md).

`migrations/0010b_app_write_kardex.sql` ya está aplicado: `app_write` acepta insertar en `erp_movimientos` y sigue rechazando el delete («El kardex no se borra»). No hace falta volver a ejecutarlo. El archivo no está bajo `supabase/migrations`.

Después de este merge, el SQL nuevo va antes que el edge. Si el edge se publica primero, el ticket beta manda `sheet_row` nulo y el insert falla mientras la columna siga siendo NOT NULL.

```bash
supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0011_erp_tx.sql
supabase functions deploy api --project-ref heuolwxyxoezkewyufrl --no-verify-jwt
```

`0011_erp_tx.sql` agrega `tickets.origin` (`sheet` o `beta`) y `beta_num`, deja `sheet_row` nulo en lo creado en la beta, y suelta la fila de hoja de las ventas `ov_save` que ya estaban. `tickets_reimportar` borra solo filas con `sheet_row` no nulo y `origin` distinto de `beta`. `TRUNCATE` no respeta el trigger: no truncar. `docs/supabase/tools/import.py` no borra filas con `origin` `beta` ni `test`. `erp_tx` mete `ov_save`, `ov_anular`, `oc_recibir` y `pago_save` en una sola transacción. La variable del lote es `v_lote` (un plpgsql `lote` es ambiguo con la columna). La siguiente OV sigue al mayor `OV-N`, `TK-N`, `TK-ROW-N` o `ticket_sheet_row`. `TK-ROW-80` da `OV-0081`; en vivo el mayor fue `TK-ROW-1642`, y por eso la primera venta salió `OV-1643`. El id `TK-AAAAMMDD-N` no entra en esa cuenta. No corre `erp_importar_legado()` ni `audit_attach_all()`. Si `erp_tx` todavía no existe, el edge vuelve a varios `app_write`. Un stock negativo que rechaza la función no se reintenta en local. Volver a correr el archivo es idempotente y deja la función ya corregida en la base.

`0016_modo_prueba.sql` hay que aplicarlo antes de encender Modo prueba. Sin la columna `origin`, `app_write` se salta el campo y un alta de prueba quedaría como dato real. El admin lo enciende por sesión, con el botón **Modo prueba** de la barra de arriba (también en el teléfono, donde no está el menú lateral). La barra naranja **MODO PRUEBA** queda en todas las pantallas. Lo que se guarda en ese modo lleva `origin = 'test'` y número `TEST-` (`TEST-TK-`, `TEST-OC-`, `TEST-OV-`), así que no corre `next_ticket_num` ni `next_oc_num`. Fuera del modo esas filas no entran en stock, kardex, dashboard, consumos, comisiones ni rol de pago. Dentro, la pantalla suma el stock real y los deltas de prueba sin escribir `erp_stock`. **Borrar datos de prueba** llama a `prueba_purgar`, que borra solo `origin = 'test'` y deja un log real. `tickets_reimportar` (y `reimportarTickets`) no borra ni pisa `origin` `beta` ni `test`. `docs/supabase/tools/import.py` usa el mismo filtro (`origin=not.in.(beta,test)`). `0016b_espejo_test.sql` ya está aplicado: el trigger `espejo_origen` de 0013 deja `origin='test'` como está y no lo pasa a `beta`.

```bash
supabase db query --project-ref heuolwxyxoezkewyufrl < docs/supabase/pending/0016_modo_prueba.sql
supabase functions deploy api --project-ref heuolwxyxoezkewyufrl --no-verify-jwt
```

`0009_erp_permisos.sql` es idempotente y, al final, corre `erp_importar_legado()` y `audit_attach_all()`. El navegador no manda apikey: `verify_jwt` va en false en `supabase/config.toml` y otra vez en el deploy.

Los secretos `ACUITY_UID`, `ACUITY_KEY`, `JIBBLE_CLIENT_ID` y `JIBBLE_CLIENT_SECRET` ya están en la función. `index.ts` los lee del entorno. No hace falta pegarlos en el cliente.

## Login

El edge no compara el hash. Llama a `login_pin(pin, ip)`, que llama a `verificar_pin(pin)` solo con service role.

- 8 PIN malos de la misma IP en 15 minutos → espera.
- 5 intentos del usuario, o `bloqueado_hasta` en el futuro → espera.
- Un PIN bueno pone `intentos_fallidos` en 0.
- El PIN no se escribe en logs.
- Si `login_pin` todavía no existe, el edge cae al hash SHA-256 de `usuarios` y, si tampoco, al Apps Script. Esa caída es solo para pruebas locales.

La cuenta bloqueada responde: «⚙️ Sistema en actualización — si requieres información adicional, comunícate con el administrador».

El número de ticket usa `next_ticket_num()` (`ticket_seq`) cuando la función existe. Si no, sigue el contador de `app_kv`. La OC nueva usa `next_oc_num()` (`oc_seq_2026`) con la misma reserva.

## Qué está hecho

| Módulo | Estado |
|---|---|
| Shell, menú, Crear, deep link `#/m/` y `#/doc/` | Implementado en `beta.html` |
| Productos con uso, inventario Venta/Cabina, kardex | Implementado |
| RFQ → OC → recepción con bodega por línea | Implementado |
| Ticket como orden de venta, stock negativo con confirmación | Implementado |
| Cotización a clienta | Implementado |
| Comisiones propias, rol histórico, caja, paquetes, gift cards, bitácora, cabina, conteos, transferencias, permisos | Implementado, más delgado que la app viva |
| Asistencia | Reloj propio (entrada, salida, almuerzo), radio y selfie, permisos y vacaciones, horas del rol. `jibble_historial` queda vacía para el import |
| Citas Acuity | Parcial: solo si los secretos responden. Si fallan, la lista sale vacía |

Acciones del edge, agrupadas:

- **Implementadas.** `version`, `login`, `whoami`, `permisos_get`, `permisos_guardar`, catálogo, inventario calculado (entradas − ventas desde 2026-05-22), historial, tickets del día, editar/eliminar/excluir comisión, factura y cobro, gift cards, paquetes y usos, promos, caja v2, propinas, multas, dashboard de cosmetóloga, reporte admin, cotizaciones, mensajes, seguimiento, KPI del mes, roles, cabina (lectura y la mayoría de escrituras), bitácora, CRUD `beta*`, y el motor ERP (`prod_*`, `stk_*`, `oc_*`, `pago_save`, `oc_devolver`, `rfq_*`, `trf_*`, `conteo_*`, `ajuste_save`, `ov_save`, `ov_anular`, `reorden_sugerir`). La pantalla de la OC registra el pago y la devolución.
- **Asistencia.** `asis_config`, `asis_config_guardar`, `asis_marcar`, `asis_hoy`, `asis_periodo`, `asis_corregir`, `asis_auditoria`, `asis_permiso_solicitar`, `asis_permiso_resolver`, `asis_feriado`. `getRolIndividual` usa esas horas. `getPermisos`, `savePermiso` y `updatePermiso` quedan en el módulo asistencia y solo un admin aprueba.
- **Parciales.** `getDashboardHoy` (solo admin) arma el pulso del Apps Script: venta, faciales, paquetes, productos y margen (`valProd` − `costoProd`), canjes, extras, listas del día, citas de Acuity y gift cards. `testDiasJibble` sigue como sonda del token de Jibble; la pantalla ya no lo llama. `getCitas` / etiquetas Acuity. `getKPIsHistoricos` (el .xls de Mi Negocio no está). `guardarGCDigital`, seguimiento, WhatsApp, tarjetas enviadas y fotos de cabina escriben en `app_kv` y, si la columna existe, copian a la tabla de 0008. `getHistorialComisiones` lee `historial_comisiones` cuando la tabla responde. `crearTicket` numera con `ticket_seq` si el RPC existe. `getRolIndividual` lee `rrhh_empleadas`, horas de asistencia y, si `rol_calcular` no responde, comisiones de `tickets` / catálogo / multas.
- **Faltan.** Cron (factura, efectivo, respaldos, KPI histórico). Subida a Drive y correo de Gmail. Menú de la hoja, reparación de fórmulas y `onEdit`. Push y PDF. El calendario de feriados nace vacío. El import de `jibble_historial` lo hace el coordinador. Timesheets vivos de Jibble y archivos de Drive/Gmail.

## Huecos que hay que leer antes de comparar números

- `getDashboardHoy` usa las mismas fórmulas que el Apps Script y lee todos los tickets (la hoja solo mira las últimas ~1500 filas). El saldo de caja se recalcula desde el último `SALDO INICIAL`. El monto de una gift card es la columna G (apellido) cuando ese texto es un número; si no, usa `valor` cuando es un monto y no el texto «Gift Card». Las citas salen de Acuity con `ACUITY_UID` / `ACUITY_KEY`; sin secretos o si Acuity falla, el conteo es 0. Los tickets internos (SUNSU, sin cosmetóloga, cédula interna) entran en el total, igual que en la hoja.
- El stock de percha de la hoja INVENTARIO no se migró. Venta = `stock_inicial` (casi siempre 0) + entradas recibidas, sin las notas «COMPRA DIRECTA», menos lo vendido desde el 22 de mayo de 2026. Los conteos físicos históricos quedan como registro, no se re-postean. Cabina abre con el saldo importado, no con el historial de consumo.
- `ov_save` descuenta inventario, crea la orden de venta e inserta el ticket con `origin = 'beta'`, `sheet_row` nulo y `beta_num` (`ticket_seq` o, si no hay secuencia, desde `TK-…-900001`). Así una reimportación de la hoja no pisa ni borra esa fila. `ov_anular` deja `atendido_por` vacío en la misma transacción para que esa venta salga de `v_tickets`. El número de la OV sigue al mayor `OV-N` / `TK-N` / `TK-ROW-N`. `OV-0081` es el ejemplo con máximo 80; la primera venta en vivo fue `OV-1643` porque el mayor importado era `TK-ROW-1642`. El stock de percha de la hoja sigue sin migrar.
- Con `0011` aplicado, `ov_save`, `ov_anular`, `oc_recibir` y `pago_save` corren en `erp_tx` (un candado y una transacción). El resto de movimientos ERP sigue siendo un `app_write` cada uno. El trigger de uso y el de «no borrar kardex» corren dentro de esa transacción. Hasta que `erp_tx` exista, el edge cae a varios `app_write` y `MemoryDb` hace lo mismo, revirtiendo el plan si una escritura falla a mitad.
- La service role salta el RLS. El candado que ve el personal es `handle()`: niega el módulo, fuerza el nombre propio y quita costos, teléfonos y correos. `app_read` (0009b, security invoker, solo `service_role`) hace `set local role sunsu_rls`. `app_acceso` es security definer para poder leer `app_modulos`. `SupabaseDb.all` no llama a `app_read`, porque filtrar tickets dentro de un total (inventario, comisiones) rompería la cifra. Quien lea PostgREST directo con la service role ve todo. El listado de clientas antiguas deja el teléfono en blanco salvo admin y super_admin.
- Clientes y tickets abren una fila por clienta (visitas, última visita y, si es admin, total). El panel lista cada venta. Solo admin o super_admin edita líneas: el servidor recalcula subtotal, IVA 15%, total, comisión de producto (30% de neto menos costo) y comisión de facial, y postea el delta al kardex. Una cosmetóloga ve solo sus tickets y sin precios. `0015_ventas_compras.sql` ya está aplicada: `gift_cards.saldo`, `gift_card_movimientos` y `erp_oc.tipo` / `q_label` / `snap`.
- La quincena de consignación es 1–15 y 16–fin (el ciclo de comisiones sigue en 26–25). La reposición arranca en vendido × 1.20 y se puede cambiar en la orden; cada cantidad sugerida también se edita antes de generar. Casa es la bodega principal. Venta es el mostrador de La Esquina y Cabina 1 conserva el saldo que ya estaba en Cabina. El PDF de consignación tiene dos páginas: la pre-factura (vendido y lo pasado a cabina, a precio de compra + IVA) y el pedido de restock. El acta de entrega sigue aparte, al recibir. `0017_lugares.sql` hay que aplicarlo para que Casa, Cabina 2, Cabina 3 y el consumo de consignación existan en la base. No reescribe cantidades.
- Una gift card puede cubrir parte de un facial más caro. Se factura la diferencia y el saldo baja. La comisión del facial es siempre la tarifa fija del facial hecho, aunque la gift card cubra una parte. Un canje `SI` sin monto `aplica` sigue como antes.
- `app_settings` existe en 0008 y esta beta no lo escribe.
