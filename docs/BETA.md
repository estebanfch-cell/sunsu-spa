# Sistema Central beta

La operación diaria sigue en [sunsu.html](../sunsu.html). Esta beta es una app aparte, con menú lateral y un botón **Crear**, sobre Supabase (`heuolwxyxoezkewyufrl`). Después del merge se abre en `https://app.sunsuspa.com/beta.html`.

El servicio worker está en `/sw.js` (caché `2026-10-21-BETA`) porque la página vive en la raíz, no en `/beta/`. El ícono de iOS va embebido en `beta.html`.

## Plan

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
| Asistencia Jibble | Parcial: comprueba que la persona existe. No arma las horas del rol |
| Citas Acuity | Parcial: solo si los secretos responden. Si fallan, la lista sale vacía |

Acciones del edge, agrupadas:

- **Implementadas.** `version`, `login`, `whoami`, `permisos_get`, `permisos_guardar`, catálogo, inventario calculado (entradas − ventas desde 2026-05-22), historial, tickets del día, editar/eliminar/excluir comisión, factura y cobro, gift cards, paquetes y usos, promos, caja v2, propinas, multas, dashboard de cosmetóloga, reporte admin, cotizaciones, mensajes, seguimiento, KPI del mes, roles, cabina (lectura y la mayoría de escrituras), bitácora, CRUD `beta*`, y el motor ERP (`prod_*`, `stk_*`, `oc_*`, `rfq_*`, `trf_*`, `conteo_*`, `ajuste_save`, `ov_save`, `ov_anular`, `reorden_sugerir`).
- **Parciales.** `getDashboardHoy` (semana y mes repiten el conteo de hoy). `testDiasJibble` (token y nombre, sin timesheet). `getCitas` / etiquetas Acuity. `getKPIsHistoricos` (el .xls de Mi Negocio no está). `guardarGCDigital`, seguimiento, WhatsApp, tarjetas enviadas y fotos de cabina escriben en `app_kv` y, si la columna existe, copian a la tabla de 0008. `getHistorialComisiones` lee `historial_comisiones` cuando la tabla responde. `crearTicket` numera con `ticket_seq` si el RPC existe.
- **Faltan.** Cron (factura, efectivo, respaldos, KPI histórico). Subida a Drive y correo de Gmail. Menú de la hoja, reparación de fórmulas y `onEdit`. Push y PDF. `pago_save` y `oc_devolver` están en el permiso y la pantalla todavía no los llama: el motor responde «Operación ERP desconocida». Horas de Jibble para el rol. Timesheets y archivos de Drive/Gmail.

## Huecos que hay que leer antes de comparar números

- El stock de percha de la hoja INVENTARIO no se migró. Venta = `stock_inicial` (casi siempre 0) + entradas recibidas, sin las notas «COMPRA DIRECTA», menos lo vendido desde el 22 de mayo de 2026. Los conteos físicos históricos quedan como registro, no se re-postean. Cabina abre con el saldo importado, no con el historial de consumo.
- `ov_save` descuenta inventario y crea la orden de venta. No inserta la fila de `tickets`, así que esa venta no entra todavía a comisiones ni al ticket del día.
- Cada movimiento ERP es un `app_write` aparte. El trigger de uso y el de «no borrar kardex» corren por sentencia. No hay una sola transacción que envuelva la recepción completa. Las pruebas locales sí son un solo proceso (`MemoryDb`).
- La service role salta el RLS. El candado que ve el personal es `handle()`: niega el módulo, fuerza el nombre propio y quita costos, teléfonos y correos. `app_read` hace `set local role sunsu_rls` para quien lo llame. `SupabaseDb.all` no lo usa, porque filtrar tickets dentro de un total (inventario, comisiones) rompería la cifra. Quien lea PostgREST directo con la service role ve todo.
- `erp_clientes` no tiene «atendida por». Por eso una cosmetóloga, cuyo módulo es propio, no ve el directorio en la pantalla.
- `app_settings` existe en 0008 y esta beta no lo escribe.
