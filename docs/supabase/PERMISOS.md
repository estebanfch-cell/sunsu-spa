# Permisos — Sistema Central beta

La beta sigue el modelo de Minecore: el rol no es un adorno de la pantalla. Cada acción del edge function comprueba el rol y el módulo, y la base repite la misma regla con políticas RLS. `admin` y `super_admin` ven todo. Los demás ven solo lo que dice la matriz, y la matriz la cambia únicamente `super_admin`.

La bandera **cosmetóloga** (`cosmetologas.es_cosmetologa`) no es un rol. El cálculo de metas de paquetes (el divisor N) lee esa bandera y nada más. Una persona puede ser `asistente_cosmetologia` y estar marcada, o ser `cosmetologa` y no contar para N.

## Roles

| Rol | Quién | Datos de otras personas | Costos, márgenes, precios de compra |
|---|---|---|---|
| `cosmetologa` | Trata y vende | No | No |
| `asistente_cosmetologia` | Apoya en cabina | No | No |
| `recepcion` | Agenda, caja, gift cards, paquetes | No (sus tickets, su comisión, su rol, su asistencia) | No |
| `gerente` | Ve la operación del spa | No en comisiones, rol de pagos ni asistencia | No |
| `admin` | Administración | Sí | Sí |
| `super_admin` | Mega admin | Sí, y es la única que edita esta matriz | Sí |

Los nombres viejos del Apps Script se aceptan al leer una sesión y se normalizan: `admin_master` → `super_admin`, `reception` → `recepcion`, `staff` → `cosmetologa` si `es_cosmetologa` es verdadera y `asistente_cosmetologia` si no.

## Matriz por defecto

Acceso: **todos** (el módulo completo), **propio** (solo filas de esa persona) o **no** (el módulo no existe para ese rol).

| Módulo | Cosmetóloga | Asistente | Recepción | Gerente |
|---|---|---|---|---|
| Inicio | todos | todos | todos | todos |
| Tickets (orden de venta) | propio | propio | propio | propio |
| Comisiones | propio | propio | propio | propio |
| Rol de pagos | propio | propio | propio | propio |
| Asistencia | propio | propio | propio | propio |
| Productos (precio de venta) | todos | todos | todos | todos |
| Ver costos | no | no | no | no |
| Clientes | propio | no | todos | todos |
| Proveedores | no | no | no | no |
| Compras (cotización, OC, recepción) | no | no | no | no |
| Inventario | todos | todos | todos | todos |
| Transferencias | no | todos | no | todos |
| Conteos | no | todos | no | todos |
| Kardex | no | no | no | todos |
| Cotizaciones a clientas | no | no | todos | todos |
| Paquetes | propio | no | todos | todos |
| Gift cards | no | no | todos | todos |
| Caja | no | no | todos | todos |
| Bitácora | todos | todos | no | todos |
| Cabina | todos | todos | no | todos |
| Usuarios | no | no | no | no |
| Permisos | no | no | no | no |

`admin` y `super_admin` tienen **todos** en cada módulo de datos. **Permisos** (editar esta tabla) es solo `super_admin`. **Ver costos** no se puede delegar: aunque alguien escriba `todos` en `app_modulos`, el guardado lo rechaza.

Recepción y gerencia arrancan con tickets **propio**, igual que el resto del personal. Si el mostrador tiene que ver el día completo, `super_admin` cambia esa celda a `todos` en la pantalla Permisos. No hace falta otro deploy.

## Qué es "propio"

La fila es de la persona si el nombre del ticket (`atendido_por`), de la comisión, del rol o de la asistencia coincide con su nombre, su nombre corto o su id. Andrea ve «Andrea» y «Andrea Robles». No ve a Daniela.

Teléfonos y correos de clientas: solo recepción, gerencia, admin y super_admin. El edge function los quita del JSON para los demás roles (`telefono`, `celular`, `whatsapp`, `email`).

## Dos candados

1. **API.** El edge function usa la service role, y esa role salta el RLS. Por eso `handle()` hace tres cosas en cada request: niega el módulo, fuerza los parámetros personales (`cosmetologa` / `nombre` = la sesión) y borra del JSON los campos de costo (`precio_compra`, `compra`, `costo`, `utilidad`, `margen`, costo empresa, IESS patronal). Un listado de tickets o de roles de pago se filtra a la persona antes de salir.
2. **Postgres.** El rol `sunsu_rls` no tiene `BYPASSRLS`. `app_read(uid, rol, nombre, tabla)` hace `set_config('app.user' / 'app.rol' / 'app.uid' / 'app.nombre')` y `set local role sunsu_rls`. Las políticas leen `app_acceso()` y `app_es_propio()`. `sunsu_admin` ve todas las filas y todas las columnas. A `sunsu_rls` se le revoca el `SELECT` de las columnas de costo. `service_role` puede asumir esos dos roles (`grant sunsu_rls, sunsu_admin to service_role`).

Tablas con fila personal: `tickets`, `rrhh_empleadas`, `rrhh_historial`, `multas_descuentos` y, si la columna existe, `historial_comisiones`.

## Login

`app_usuarios.pin_hash` es bcrypt. El edge no compara el hash: llama a `login_pin(pin, ip)`, que llama a `verificar_pin(pin)` (solo service role).

- 8 PIN malos desde la misma IP en 15 minutos → espera.
- 5 intentos del usuario (`intentos_fallidos`) o `bloqueado_hasta` en el futuro → espera.
- Un PIN bueno reinicia el contador de esa cuenta.

El PIN no se escribe en logs.
