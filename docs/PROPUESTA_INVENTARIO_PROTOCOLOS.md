# Propuesta: un solo inventario, tres lugares y protocolos de facial

Documento para que Emilia apruebe el diseño antes de construir. No cambia el sistema todavía. El look de Sunsu, las reglas de comisión, la quincena de consignación y el Modo prueba se quedan como están.

Fecha: 22 de octubre de 2026.

---

## Resumen

Hoy el stock vive en dos sitios a la vez: el inventario del beta (venta y cabina) y la hoja de Cabina (cerrados en casa, cerrados en el local, abiertos). A veces el equipo arma un ticket como si Sunsu le comprara productos a sí misma para llevarlos a cabina. Eso mueve números sin dejar una compra real ni una liquidación al proveedor.

La propuesta junta todo en **un solo inventario**. El producto entra una sola vez, cuando se recibe la orden de compra, y de ahí se mueve con un registro de quién, cuándo y a dónde.

Tres lugares físicos:

| Lugar | Dónde está | Para qué |
| --- | --- | --- |
| **Casa** | La casa | Bodega principal. Casi todo llega aquí y espera. |
| **Venta** | El spa, en el mostrador | Lo que se vende a la clienta. Sale con el ticket. |
| **Cabina** | El spa, en el tratamiento | Lo que se gasta en el facial. Sale con el protocolo. |

La **consignación** (Hebetronic y las demás) es de quién es el producto, no un cuarto lugar. Un sérum Hebetronic puede estar en Casa, en Venta o en Cabina, y sigue siendo de ellos hasta que se vende o se consume.

Cada facial del catálogo tiene un **protocolo**: la lista de productos y cantidades que se descuentan de Cabina por cada ticket. Las cosmetólogas marcan cuándo **abren** y cuándo **terminan** un envase. Con ese historial el sistema compara el protocolo con el gasto real (por facial y por persona) y propone ajustes. El protocolo no se cambia solo.

En cada ticket de admin se ve la ganancia:

**lo cobrado − costo de productos (protocolo o real) − comisiones.**

Las compras nuevas pueden entrar con una foto de la factura (lectura automática) o con la clave de acceso del SRI. Una persona confirma que cada línea corresponde a un código Sunsu antes de que el stock suba.

---

## Decisiones para aprobar

Estas son las elecciones de flujo. Se pueden revertir antes de construir.

1. Hay tres bodegas: Casa, Venta y Cabina. La pantalla de hoy que dice «Casa (venta)» pasa a llamarse **Venta**. Casa es un lugar nuevo: el stock de la casa.
2. Al recibir una compra, el destino por defecto es **Casa**. Se puede cambiar la línea a Venta o a Cabina si el producto llega directo al spa.
3. Un producto de Venta sale con el ticket de venta. Un producto de Cabina sale con el protocolo del facial de ese ticket.
4. Mover stock entre lugares es una **transferencia** con historial. Deja de usarse el ticket interno «Sunsu le compra a Sunsu» y dejan de crear stock las órdenes viejas de cabina (CO-).
5. Si el producto es de consignación y se transfiere a Cabina, esa cantidad entra a la liquidación del proveedor (mismo criterio que la pre-factura: precio de compra + IVA), dentro de la quincena.
6. «Abrí» y «Terminé» aceptan varias unidades a la vez. Abrir el siguiente envase da por terminado el anterior, con un botón para decir que el anterior sigue abierto.
7. Las sugerencias de protocolo las ve el admin y las aplica a mano. El historial de aperturas no reescribe el protocolo.
8. El margen del ticket lo ven admin y quien tenga permiso de costos. El resto del equipo no ve precios de compra ni margen.
9. La foto de la factura y la clave del SRI proponen códigos. El stock sube cuando alguien confirma la recepción.
10. El conteo físico de inicio reparte lo que hay hoy entre Casa, Venta y Cabina. Hasta ese conteo no se adivina qué parte del número actual está en la casa y qué parte está en el mostrador.

---

## Cómo se mueve un producto

```text
Orden de compra
    → se recibe (se elige el lugar, casi siempre Casa)
        → inventario
            → se queda ahí hasta que se despacha

De Casa se puede pasar a Venta o a Cabina.
De Venta se puede pasar a Cabina.

Venta  → sale cuando se vende (el ticket es la orden de venta).
Cabina → sale cuando se hace el facial (el protocolo descuenta).
```

Nada entra al inventario escribiendo un número en una bodega. Si falta producto, la vía es una compra recibida, una transferencia o un conteo que explique la diferencia.

La idea viene del flujo de MineCore (una sola función mueve el stock, la orden de compra se recibe por líneas, la transferencia queda auditada, cada servicio tiene receta). Sunsu ya tiene parte de eso en el beta: órdenes de compra, recepción, kardex, transferencias entre dos bodegas y el ticket como venta. Esta propuesta le agrega Casa, une la hoja de Cabina con ese kardex y hace que el facial descuente de verdad.

---

## Los tres lugares y la consignación

**Casa** guarda cajas cerradas. Es el origen habitual después de una compra.

**Venta** es la repisa del spa. Lo que está ahí se puede vender en un ticket.

**Cabina** es el consumo del tratamiento: envases cerrados en el local y envases ya abiertos.

Un mismo código puede existir en los tres lugares. El saldo de cada lugar es independiente. El kardex muestra cada entrada y cada salida; no se borra un movimiento para «corregir». Una corrección es un movimiento nuevo (devolución, ajuste de conteo o transferencia de regreso).

**Consignación** es un dato del producto: propio de Sunsu, o en consignación de un proveedor (Hebetronic u otro). El lugar físico no cambia por eso. Mientras está en Casa o en Venta, sigue siendo del proveedor y entra en la quincena como hoy: Sunsu paga lo vendido, a precio de compra + IVA, y el pedido de reposición va en la segunda página del mismo PDF. El acta de entrega sigue al recibir.

Cuando ese producto **pasa a Cabina**, ya no se va a vender: se va a gastar en faciales. Esa transferencia anota el consumo para el proveedor, para que la quincena lo incluya junto con lo vendido en mostrador. Así no queda producto de Hebetronic «perdido» entre la casa y la cabina sin factura.

---

## Qué sale en cada ticket

El ticket sigue siendo la venta del día.

- Si la línea es un **producto de mostrador**, se descuenta de **Venta** al cerrar el ticket. Si no hay saldo, aplica la regla que ya existe: hace falta aprobación para quedar en negativo.
- Si la línea es un **facial**, se descuenta de **Cabina** la lista del protocolo vigente de ese facial: producto, cantidad y unidad.
- Si el facial todavía no tiene protocolo cargado, el ticket se puede cobrar y el sistema lo marca como «facial sin protocolo». No inventa cantidades. Esas líneas aparecen en un aviso para completar el protocolo antes de confiar en el costo.

La primera vez que un protocolo esté completo se puede correr en **espejo**: calcula el consumo de los tickets recientes y lo muestra, sin bajar el stock. Eso ya existe en Cabina como fase 2. Cuando el espejo salga limpio, el mismo protocolo pasa a descontar en vivo.

Los protocolos viejos de la hoja se conservan. En el archivo histórico del Excel había **6 protocolos con pasos, cantidades y tiempos**, más el resto de faciales sembrados vacíos. Esas cantidades están en la hoja (`cabina_protocolos` y `cabina_protocolo_pasos`), no en este repositorio, así que este documento no las copia ni las inventa. Al construir, se leen de la hoja y se muestran para confirmar.

### Faciales del catálogo

Son los 12 faciales que el ticket ya conoce. Precio de lista y comisión fija de la cosmetóloga (la comisión del facial es siempre esa tarifa completa, también si se pagó con gift card):

| Código | Facial | Precio | Comisión |
| --- | --- | ---: | ---: |
| SUNSU-01 | Facial S.O.S | 75.00 | 2 |
| SUNSU-02 | Facial Reparación | 65.00 | 2 |
| SUNSU-03 | 7 Pieles (Arroz + H₂O) | 65.00 | 2 |
| SUNSU-04 | Facial Gold-Aging | 65.00 | 2 |
| SUNSU-05 | Facial Porcelana | 65.00 | 2 |
| SUNSU-06 | Facial Rice Flow | 80.50 | 2 |
| SUNSU-40 | Facial Reset 3x1 | 95.00 | 3 |
| SUNSU-41 | Facial Domo de Oxígeno | 95.00 | 3 |
| SUNSU-42 | Facial Peeling Marino de Perla | 145.00 | 3 |
| SUNSU-43 | Facial de Geisha | 145.00 | 3 |
| SUNSU-52 | Facial de Ginseng | 95.00 | 3 |
| SUNSU-57 | Facial K-Lift | 95.00 | 3 |

Cada uno tendrá su protocolo. Los seis que ya tienen pasos en la hoja entran con esas cantidades. Los otros quedan en blanco hasta que se llenen, y mientras tanto el ticket avisa que faltan.

Los extras, paquetes de 3 y de 6 y la venta de producto suelto siguen como hoy. Un paquete que incluye un facial usa el protocolo de ese facial en la sesión en que se realiza, no el día en que se vende el paquete.

---

## Consumo real: abrir y terminar

El protocolo es la receta. El envase real no se acaba en la cantidad exacta de la receta: una persona usa más bombas, otra menos. Por eso las cosmetólogas registran la vida del envase con dos botones grandes.

**Abrí.** Elige el producto (nombre, código o cámara del código de barras) y cuántos envases abre. Puede abrir varios a la vez. Esos envases pasan de cerrados a abiertos en Cabina.

**Terminé.** Elige cuál se acabó y cuántos. Si solo hay uno abierto de ese producto, no pregunta cuál.

**Regla por defecto.** Si abre el siguiente y todavía figura uno abierto del mismo producto, el sistema da por terminado el anterior. En la misma pantalla hay una opción «este sigue abierto» para cuando de verdad hay dos abiertos (por ejemplo uno en cada cabina).

El historial guarda quién, cuándo, cuántos y si el cierre fue marcado a mano o quedó implícito al abrir el siguiente. Las filas viejas de aperturas (`AP-`) se conservan.

Cabina 1, Cabina 2, Cabina 3 y General, del plan de botones, son **sitios del envase abierto dentro de Cabina**, no bodegas nuevas. Sirven para saber en qué sala está la botella abierta. El saldo de Cabina sigue siendo uno solo.

### Qué se aprende

Con tickets + protocolos + aperturas, el admin ve, por facial y por cosmetóloga:

- cuánto dice el protocolo que se gasta;
- cuánto duró cada envase en la práctica (de Abrí a Terminé);
- cuántos faciales de ese tipo se hicieron mientras el envase estuvo abierto;
- la diferencia, en unidades y en dólares.

Ejemplo de lectura: el protocolo del Facial Porcelana dice 4 bombas de un sérum. En tres meses, con Andrea el envase alcanza para menos faciales que con el protocolo, y con otra persona alcanza para más. El sistema propone una cantidad distinta y muestra cuánto cambiaría el costo del facial. **Aplicar el cambio es una decisión de Emilia** (o de quien ella designe): se guarda una versión nueva del protocolo y la anterior queda vigente = no, para poder comparar después.

Hasta tener varias semanas de Abrí/Terminé, el margen usa el costo del protocolo. Cuando ya hay historial suficiente de esa persona en ese facial, el ticket puede mostrar al lado el costo real estimado. Los dos números se ven; no se reemplaza el protocolo en silencio.

La estadística es una cuenta sobre el historial (duración del envase, faciales atendidos, cantidad por paso). Una capa posterior puede resumir eso en una frase («Andrea usa cerca de 6 bombas donde el protocolo dice 4»). No hace falta un modelo externo para la primera versión.

---

## Transferencias

Reemplazan el ticket interno y las órdenes CO- que hoy suman stock de cabina al recibirlas.

Movimientos habituales:

- Casa → Venta (bajar producto al mostrador)
- Casa → Cabina (bajar producto de tratamiento)
- Venta → Cabina (un producto de mostrador se pasa a uso de cabina)

Cada transferencia tiene número, fecha, quién la hizo, origen, destino y líneas. Queda en el kardex de los dos lugares. Se puede deshacer con el movimiento inverso, no borrando la fila.

Si la línea es **consignación** y el destino es **Cabina**, la pantalla lo dice en una frase antes de confirmar: «Este producto es de Hebetronic. Al pasarlo a Cabina se anota para la liquidación de la quincena, a precio de compra + IVA.» Esa línea entra al mismo PDF de la quincena, junto a las unidades vendidas en mostrador, para que el proveedor facture una sola vez. El pedido de reposición sigue en la página siguiente, con el colchón editable que ya existe.

Casa → Venta de un producto en consignación no liquida: sigue a la venta. Se liquida cuando se vende (como hoy) o cuando entra a Cabina (lo nuevo).

---

## Ganancia del ticket

En el detalle del ticket, solo para admin o permiso de costos:

| | |
| --- | --- |
| Ingreso | Lo cobrado en el ticket, sin IVA, con el precio real de esa venta (gift card, promo o precio de lista, como ya se cobra). |
| Costo de productos | Suma del protocolo del facial, a costo de compra de cada insumo, más el costo de los productos de mostrador vendidos en el mismo ticket. |
| Costo real | El mismo ticket, con el consumo estimado de quien hizo el facial, cuando ya hay historial. Si todavía no hay historial, se muestra el del protocolo y una nota corta. |
| Comisiones | Facial: tarifa fija del facial hecho (2 o 3 dólares). Producto de mostrador: 30 % del margen de ese producto, como hoy. |
| Ganancia | Ingreso − costo de productos − comisiones. |

La comisión del facial no se prorratea por gift card. Un facial de 145 dólares sigue pagando 3 dólares aunque la clienta haya usado una gift card.

Los costos fijos del local (renta, luz, lavandería) siguen aparte, en el prorrateo que Cabina ya calcula por duración del protocolo. No entran en esta ganancia por ticket en la primera versión, para no mezclar un costo mensual con un ticket del día. Se puede sumar después, cuando los minutos de cada protocolo estén cargados.

---

## Compras nuevas: foto y SRI

Hoy la orden de compra se arma a mano y, al recibir, elige bodega. Eso se mantiene. Se agregan dos formas de no tipear la factura.

### Foto de la factura

Se toma la foto o se sube el PDF. Una lectura automática (OCR) propone proveedor, número, fecha y líneas: descripción, cantidad y precio. Cada línea se acerca al código Sunsu por nombre y por el código del proveedor, si ya se cruzó antes.

Nada entra al stock en ese paso. La persona revisa, corrige un código si la sugerencia falló, elige Casa (u otro lugar) y confirma la recepción. El cruce que confirmó se recuerda para la próxima factura del mismo proveedor.

### Clave de acceso del SRI

En Ecuador la factura electrónica tiene una **clave de acceso de 49 dígitos**. El SRI publica un servicio para consultar **una** clave y, si está autorizada, devolver el XML del comprobante.

Lo que sí es viable, y conviene hacer:

1. Pegar la clave, o subir el XML que el proveedor ya manda por correo.
2. El sistema llama al servicio de autorización del SRI (`autorizacionComprobante` en el ambiente de producción `cel.sri.gob.ec`, servicio Autorización de comprobantes offline) o lee el XML subido.
3. Del detalle salen código del proveedor, descripción, cantidad y precio unitario.
4. Igual que con la foto: se proponen los códigos Sunsu y una persona confirma antes de recibir.

La página pública de validez del SRI (`srienlinea.sri.gob.ec`, validez de comprobantes) sirve para comprobar una clave o un archivo. No reemplaza el paso de cruzar con nuestros códigos.

Lo que **no** está disponible como integración simple: un buzón que liste solas todas las facturas de compra del RUC de Sunsu. Eso exige entrar a SRI en línea con el usuario del contribuyente, o un intermediario comercial. No es la primera fase. Si más adelante se quiere, es un proyecto aparte (clave del SRI de Sunsu, revisión de términos y un proceso de consentimiento).

Hasta entonces, el camino práctico es: la factura llega por correo o en papel → foto, XML o clave → confirmar → stock en Casa.

---

## Pantallas

Misma cara Sunsu: lista y, al tocar la fila, el detalle. En el teléfono, un dato grande por paso. Textos vacíos que dicen qué falta y qué botón sigue.

**Inventario.** Tres chips: Casa, Venta, Cabina. Cada fila muestra código, nombre completo y unidades. Tocar abre la ficha: saldo por lugar, si es propio o consignación, protocolo que lo usa, últimas entradas y salidas. Buscador por nombre, código y código de barras.

**Recibir compra.** Lista de órdenes. Al abrir una, cada línea tiene cantidad recibida y lugar, con Casa ya elegido. Botones extra en esa pantalla: «Foto de la factura» y «Clave o XML del SRI». Las sugerencias se ven como líneas editables. Confirmar recibe.

**Transferir.** Origen, destino, productos y cantidades. Si hay consignación hacia Cabina, la frase de liquidación aparece antes del botón Confirmar. El detalle queda con su número para volver a verlo.

**Protocolos.** Una fila por facial de la tabla de arriba. Verde si tiene pasos, ámbar si está vacío. Al abrir: los pasos (producto, cantidad, unidad, minutos), el costo del protocolo, y —cuando exista historial— el consumo real por cosmetóloga y el botón «Guardar como versión nueva».

**Abrí / Terminé.** Dos botones grandes en Cabina, del tamaño del `+`. Cantidad numérica grande. Si aplica la regla del envase anterior, una línea lo dice y ofrece «sigue abierto».

**Ticket.** Para quien ve costos, una tarjeta al final: ingreso, costo protocolo, costo real si ya hay dato, comisiones, ganancia. Si el facial no tiene protocolo, la tarjeta lo dice y no muestra una ganancia inventada.

**Conteo de inicio.** Un lugar a la vez. Un producto en pantalla. El número se escribe; no se rellena con lo que dice el sistema. Aplicar deja el ajuste en el kardex.

El kardex sigue solo para admin, dentro de Inventario.

---

## Cambios de datos

Para quien construya. La dueña puede saltarse esta sección.

Se extiende el inventario que el beta ya tiene (`erp_bodegas`, `erp_stock`, `erp_movimientos`, órdenes de compra, transferencias, conteos). No se abre un kardex paralelo.

- Nueva bodega **Casa** (`tipo = casa`). Venta y Cabina siguen. El nombre visible de Venta deja de ser «Casa (venta)».
- En el producto: tenencia `propio` o `consignacion`, y el proveedor dueño cuando es consignación. El uso (`venta`, `cabina`, `ambos`) se mantiene: un producto `venta` no se recibe directo en Cabina sin una decisión explícita, igual que hoy.
- `erp_receta` (el vínculo fino que el ticket ya consulta) se llena desde el protocolo vigente. Una sola fuente: `cabina_protocolos` + `cabina_protocolo_pasos`. Cambiar el protocolo actualiza la receta de la versión nueva; los tickets viejos guardan la versión con la que se calcularon.
- Aperturas: cantidad (no solo 1), estado `abierta` o `terminada`, si el cierre fue implícito, y sitio opcional (Cabina 1, 2, 3 o General).
- Transferencia a Cabina de un producto en consignación: línea de liquidación (producto, cantidad, costo, IVA, quincena, transferencia de origen) para que el PDF de la quincena la sume a lo vendido.
- Comprobante de compra: foto o XML, clave de acceso, líneas propuestas, código Sunsu confirmado, orden de compra a la que se ligó. Estado `borrador` hasta la recepción.
- En el ticket, al cerrarlo: costo de protocolo, costo real (vacío si no hay historial), comisión y ganancia. Se guardan para que un cambio posterior de protocolo no reescriba el pasado.

Todo movimiento de stock sigue pasando por el mismo punto que hoy (`mover` / `erp_tx`). En Modo prueba esos movimientos quedan marcados como prueba y no tocan el saldo real. Hace falta tener aplicada la migración de Modo prueba en producción antes de usar la prueba con datos vivos; eso es independiente de este diseño.

Las hojas actuales no se borran: `cabina_inventario`, protocolos, pasos, aperturas, consumos, traspasos, bajas, fotos. Pasan a ser el archivo de origen y, después de la migración, la pantalla nueva lee el inventario unificado. `sunsu.html` y Apps Script no se tocan.

---

## Migración de lo que ya hay en Cabina

Orden recomendado, con el conteo físico como árbitro:

1. Crear la bodega Casa, vacía.
2. Leer `cabina_inventario` y proponer, sin aplicar todavía:
   - `bodega_cerrados` → cerrados en **Casa**
   - `envases_cerrados` → cerrados en **Cabina**
   - `abierto_restante` → abiertos en **Cabina** (sitio General si no hay sala)
3. El saldo que hoy está en la bodega llamada «Casa (venta)» del beta **no se parte solo**. Puede ser mostrador, casa, o una mezcla. El conteo de inicio dice cuánto hay en la casa y cuánto en Venta. Lo que sobre o falte queda como ajuste de conteo, con fecha y responsable.
4. Copiar protocolos vigentes y sus pasos a la receta del ticket. Los 6 que tienen cantidades entran con esas cantidades. Los faciales sin pasos quedan en la lista ámbar.
5. Conservar `cabina_aperturas` como historial. No se usan para recalcular el stock inicial: el conteo manda. Sirven para la estadística hacia adelante, y las filas viejas se muestran como «antes del conteo».
6. A partir del corte, las órdenes CO- y el botón de reponer Excel dejan de sumar stock. Los CO- pendientes se muestran una vez para pasarlos a una orden de compra de verdad o cerrarlos. Los traspasos viejos (TR-) se archivan; los nuevos son transferencias del inventario único.
7. Los consumos en modo espejo se pueden volver a correr después del corte, sobre los tickets recientes, para revisar protocolos antes de descontar en vivo.

Nada de esto borra fotos, códigos de barras ni nombres. El código de catálogo (`HT-002`, `SUNSU-01`, …) sigue siendo el código que ve el equipo. Los números internos de fila de la hoja no se muestran.

---

## En qué orden construirlo

Cada fase se puede usar sola. La siguiente no arranca hasta que la anterior esté en el día a día.

| Fase | Qué ve el equipo | Para qué |
| --- | --- | --- |
| **1. Lugares y conteo** | Casa, Venta y Cabina. Recibir compra con destino, Casa por defecto. Conteo de inicio. | Un solo origen del stock. Saber qué hay en la casa y qué hay en el spa. |
| **2. Transferencias** | Casa → Venta, Casa → Cabina, Venta → Cabina, con la frase de consignación. | Dejar el ticket interno y las órdenes CO- como forma de «crear» stock. |
| **3. Protocolos en el ticket** | Lista de los 12 faciales, pasos traídos de la hoja, espejo y después descuento real en Cabina. | Cada facial descuenta lo que dice su protocolo. |
| **4. Abrí y Terminé** | Dos botones, varias unidades, «el anterior se terminó» con opción de dejarlo abierto. | Empezar el historial de consumo real. |
| **5. Ganancia del ticket** | Tarjeta de margen para admin. | Ver si el facial deja, con el costo del protocolo y la comisión. |
| **6. Foto de factura** | OCR, cruce a códigos, confirmación humana, recepción a Casa. | Dejar de tipear facturas de proveedor. |
| **7. Clave SRI** | Pegar clave o subir XML, mismas líneas para confirmar. | Usar el comprobante electrónico cuando el proveedor lo manda. |
| **8. Sugerencias** | Por facial y por cosmetóloga, diferencia contra el protocolo y botón de versión nueva. | Ajustar la receta con datos, cuando ya haya varias semanas de aperturas. |

La fase 1 es la que conviene hacer primero: sin el conteo, los protocolos descontarían de un saldo que mezcla casa y mostrador.

El plan de botones, fotos y código de barras (documento `docs/INVENTARIO-PROTOCOLOS.md`, todavía sin fusionar) encaja en las fases 1 y 4. Las fotos oficiales de producto siguen siendo una tarea aparte y no bloquean este diseño. Donde ese plan hablaba de dos bodegas, manda este: tres lugares, y las salas solo como sitio del envase abierto.

---

## Preguntas abiertas

1. **Conteo.** ¿El número que hoy dice «Casa (venta)» es sobre todo la casa, sobre todo el mostrador, o está mezclado? El conteo lo responde; si Emilia ya lo sabe, se puede proponer el reparto y solo contar las diferencias.
2. **Liquidación a Cabina.** ¿El consumo de consignación en Cabina se paga en la quincena, al mismo precio de compra + IVA que lo vendido en mostrador? Es la recomendación de este documento. Alternativa: pagarlo el día de la transferencia, con un comprobante aparte.
3. **Quién transfiere.** ¿Solo admin, o también recepción puede bajar de Casa a Venta y a Cabina? La recomendación es: recepción puede armar la transferencia, admin la confirma si el producto es consignación hacia Cabina.
4. **Protocolos vacíos.** De los 12 faciales, ¿cuáles de los 6 con pasos del Excel siguen vigentes, y quién llena los que están vacíos antes de descontar en vivo?
5. **Costo real en el margen.** ¿La ganancia oficial del ticket es siempre la del protocolo (estable, comparable) y el costo real es solo una ayuda, o a partir de cierto historial la ganancia oficial pasa al costo real? Recomendación: el número oficial es el protocolo; el real se muestra al lado.
6. **Costos fijos.** ¿Entran en la ganancia del ticket más adelante (renta prorrateada por minutos) o se quedan en el reporte mensual de Cabina?
7. **SRI en línea.** ¿Más adelante se quiere el buzón de facturas recibidas, con el acceso del RUC, o basta con clave, XML y foto?
8. **Varios abiertos.** ¿Cuántas salas hay que nombrar (Cabina 1, 2, 3 y General) o con «abierto en cabina» alcanza al principio?
9. **Unidades del protocolo.** Las cantidades de la hoja están en la unidad que se haya cargado (bombas, ml, gotas). ¿Se confirma esa unidad al importar, para que el costo por facial use el costo por unidad del envase y no el costo del envase entero?

---

## Qué queda fuera de este papel

No se escribe código, no se mueve stock y no se suben fotos con este documento. La aprobación de Emilia define el orden de las fases y cierra las preguntas de arriba. La construcción entra después, fase por fase, con el mismo look del beta y con Modo prueba para ensayar sin tocar los saldos reales.
