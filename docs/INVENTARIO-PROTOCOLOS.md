# Inventario y protocolos — plan para las chicas

Las chicas no van a aprender un ERP. Cada acción del día tiene un botón grande, un paso, y listo. Lo que ya existe (stock, fotos, protocolos, aperturas, kardex) se conserva. La pantalla nueva tiene que ser más clara que la de hoy.

Este documento es el plan. La construcción de los botones viene después. Las fotos oficiales que sí coinciden están listadas abajo; ninguna se subió a Storage en este paso.

## Lo que ya hay, y se queda

- Cabina sigue en `cabina_inventario`: envases cerrados del local, abiertos, bodega, contenido, costo, código de barras, foto y ubicaciones. `cabinaAbrirRapido` abre un cerrado o marca que el abierto se acabó, y deja la fila en `cabina_aperturas` (`AP-###`, quién y cuándo).
- Los protocolos vigentes, sus pasos, consumos, traspasos, bajas y fotos de `cabina_fotos` no se borran ni se reponen desde cero.
- El conteo del ERP (`conteo_abrir` → `conteo_guardar` → `conteo_aplicar`) ajusta el kardex con la diferencia. No borra movimientos.
- El catálogo de venta tiene `erp_productos.foto_url`. Hoy no tiene código de barras; el de cabina sí (`cabina_inventario.codigo_barras` y `cabina_activos.codigo_barras`).
- Modo prueba sigue igual: si la sesión está en prueba, el alta y el conteo quedan `origin='test'` y no mueven el stock real.

## Cómo se usa

Dos botones, siempre a la vista en Cabina (teléfono y escritorio), del tamaño del `+`:

**Abrí producto**

1. Busca el producto por nombre, o apunta la cámara al código de barras.
2. Elige a dónde fue: Cabina 1, Cabina 2, Cabina 3 o General.
3. Un botón Confirmar. Se acabó.

Eso abre 1 envase cerrado del local (la misma cuenta de hoy: cerrados −1, abiertos +1) y anota el destino. Si no hay cerrados, el botón lo dice en una frase, sin formulario.

**Terminé producto**

1. El mismo buscador, o la cámara.
2. Si ese producto está abierto en más de un lugar, elige cuál se acabó. Si solo hay uno, no pregunta.
3. Confirmar.

Sale 1 abierto de ese lugar. Si no hay abierto, lo dice y no deja guardar.

El historial de aperturas sigue. Cada fila nueva guarda destino además de quién y cuándo. Las filas viejas no se reescriben.

### Dónde vive el abierto

Hoy hay un solo número `abierto_restante`. Con cuatro destinos hace falta saber cuántos abiertos hay en cada cabina, y que la suma siga siendo ese número.

- Cabina 1, Cabina 2, Cabina 3 y General son lugares del abierto, no bodegas nuevas. Venta y Cabina del ERP no cambian.
- Los abiertos que ya existen, sin destino, pasan a General. El total no baja a cero.
- Abrir suma 1 en el destino elegido. Terminar resta 1 ahí. `abierto_restante` = la suma de los cuatro.

## Buscar y escanear

En productos, tickets, clientes, cabina y conteo, el mismo buscador:

- nombre
- código (`HT-002`, `INV-…`)
- número de ticket (`TK-…`, `TEST-TK-…`)
- código de barras, escrito o con la cámara del teléfono

La cámara es un botón grande al lado del buscador, no un menú escondido. Si el código no está ligado, dice «Este código no está en el catálogo» y, si eres admin, ofrece ligarlo.

**Ligar un código (solo admin).** En la ficha del producto: Escanear código. Un escaneo guarda el número en el producto de venta y, si es el mismo ítem de cabina, también en `codigo_barras`. No pisa un código que ya pertenece a otro producto. Las chicas no ven este paso; a ellas el producto les sale al primer escaneo.

## Conteo físico de inicio

Se reusa el conteo que ya ajusta el kardex. No es una hoja nueva ni un borrado de stock.

- Un conteo marcado como inicio, aparte de los conteos de rutina.
- Una bodega a la vez: Venta (Casa) o Cabina (Local).
- En el teléfono: un producto en pantalla. Se llega por nombre, código o cámara. El número se teclea grande. Guardar esa línea no cierra el conteo.
- No se rellena el contado con la cantidad del sistema. Si no se contó, queda vacío y al aplicar no se mueve.
- Aplicar escribe el ajuste (`conteo`) como hoy. El kardex anterior permanece.
- Se puede dejar a medias y seguir otro día. El número `CNT-` de prueba lleva `TEST-` si la sesión está en Modo prueba.

## Fotos de producto

Tarea de este plan, hecha en la parte que se podía cerrar sin Storage.

Se revisaron los 59 productos del catálogo de ticket (`PROVS` en `beta-screens.js`), con prioridad en la consignación Hebetronic / Anua. Una coincidencia es segura solo si el nombre del catálogo es el producto oficial de anua.com, con foto de esa ficha. No se adivinó tamaño ni línea.

**No se subió ninguna imagen.** Esta sesión no tiene acceso al proyecto Supabase. `cabina_fotos`, `erp_productos.foto_url` y las fotos que ya están en las fichas no se tocaron.

Cuando haya acceso, el paso que falta es: bajar la foto de la URL de origen, guardarla en un bucket de Storage (por ejemplo `productos/<sku>.jpg`) y escribir en el producto `foto_url` (archivo propio) y la URL de origen. Si el producto ya tiene foto, no se reemplaza sola: queda la de la ficha y la oficial se ofrece aparte.

### Coincidencia segura (Anua, anua.com, 22 oct 2026)

| SKU | En el catálogo | Producto oficial | Ficha | Foto oficial |
| --- | --- | --- | --- | --- |
| SUNSU-HT-001 | Heartleaf Cleansing Oil 200ml | Heartleaf Pore Control Cleansing Oil | https://anua.com/products/heartleaf-pore-control-cleansing-oil-200ml | https://cdn.shopify.com/s/files/1/0753/1429/9158/files/anua-us-cleanser-heartleaf-pore-control-cleansing-oil-1239193742.jpg?v=1779181871 |
| SUNSU-HT-002 | Niacinamide 10%+TXA 4% Serum 30ml | Niacinamide 10 TXA 4 Serum for Brightening and Dark Spots | https://anua.com/products/niacinamide-10-txa-4-serum-2 | https://cdn.shopify.com/s/files/1/0753/1429/9158/files/anua-global-ampoule-serum-niacinamide-10-txa-4-serum-for-brightening-and-dark-spots-1239193722.jpg?v=1779177130 |
| SUNSU-HT-003 | Heartleaf Quercetinol Cleansing Foam | Heartleaf Quercetinol Pore Deep Cleansing Foam | https://anua.com/products/heartleaf-quercetinol-pore-deep-cleansing-foam | https://cdn.shopify.com/s/files/1/0753/1429/9158/files/anua-us-cleanser-heartleaf-quercetinol-pore-deep-cleansing-foam-1239193718.jpg?v=1779181814 |
| SUNSU-HT-004 | Heartleaf 77% Soothing Toner 250ml | Heartleaf 77 Soothing Toner, variante 250ml | https://anua.com/products/heartleaf-77-soothing-toner | https://cdn.shopify.com/s/files/1/0753/1429/9158/files/anua-us-toner-heartleaf-77-soothing-toner-1239193744.jpg?v=1779181932 |
| SUNSU-HT-005 | Heartleaf 77 Toner Pad 70 Pads | Heartleaf 77 Clear Pad | https://anua.com/products/heartleaf-77-toner-pad-160ml | https://cdn.shopify.com/s/files/1/0753/1429/9158/files/anua-global-toner-heartleaf-77-clear-pad-1239193736.jpg?v=1779177790 |
| SUNSU-HT-006 | Peach 70% Niacinamide Serum 30ml | Peach 70% Niacinamide Serum | https://anua.com/products/peach-70-niacinamide-serum-30ml | https://cdn.shopify.com/s/files/1/0753/1429/9158/files/anua-global-ampoule-serum-peach-70-niacinamide-serum-1239193727.jpg?v=1779177611 |
| SUNSU-HT-007 | Rice Ceramide 7 Hydrating Serum 50ml | Rice Ceramide 7 Hydrating Barrier Serum | https://anua.com/products/rice-ceramide-7-hydrating-barrier-serum | https://cdn.shopify.com/s/files/1/0753/1429/9158/files/anua-us-ampoule-serum-rice-ceramide-7-hydrating-barrier-serum-1239193730.jpg?v=1779178029 |
| SUNSU-HT-008 | Heartleaf 80% Moisture Soothing Ampoule | Heartleaf 80% Moisture Soothing Ampoule | https://anua.com/products/heartleaf-80-moisture-soothing-ampoule-30ml | https://cdn.shopify.com/s/files/1/0753/1429/9158/files/anua-us-ampoule-serum-heartleaf-80-moisture-soothing-ampoule-1261541641.jpg?v=1791443109 |
| SUNSU-HT-010 | BHA 2% Gentle Exfoliating Toner 150ml | BHA 2% Gentle Exfoliating Toner | https://anua.com/products/bha-2-gentle-exfoliating-toner | https://cdn.shopify.com/s/files/1/0753/1429/9158/files/anua-us-toner-150ml-bha-2-gentle-exfoliating-toner-1161173069.png?v=1767594654 |
| SUNSU-HT-014 | Azelaic Acid 10 Hyaluron Soothing Serum | Azelaic Acid 10 Hyaluron Redness Soothing Serum | https://anua.com/products/azelaic-acid-10-hyaluron-redness-soothing-serum | https://cdn.shopify.com/s/files/1/0753/1429/9158/files/anua-us-ampoule-serum-azelaic-acid-10-hyaluron-redness-soothing-serum-1239193732.jpg?v=1779177969 |

La ficha del aceite (HT-001) publica el GTIN `8809640732829`. El JSON público de anua.com no trae código de barras en el resto, así que esos números no se copian: se ligan escaneando el envase.

HT-005: el catálogo dice 70 pads y la ficha oficial es Heartleaf 77 Clear Pad (presentación 160 ml). Es el mismo producto; al subir la foto se conserva el nombre del catálogo.

HT-007: el catálogo dice 50 ml y la ficha oficial no parte el tamaño en el título. La foto es de ese suero. Conviene mirar el envase antes de darla por definitiva en la ficha.

### Sin coincidencia segura

No se les asigna foto. Hace falta el envase en la mano, o una ficha oficial que diga el mismo nombre.

Anua / Hebetronic:

- SUNSU-HT-009 Peach 77 Niacinamide Essence Toner 250ml. En anua.com hay Peach 77 en leche y en crema, no un tónico esencia con ese nombre.
- SUNSU-HT-011 Protector Solar Vitamin C SPF50+. Anua tiene varios protectores; ninguno se llama Vitamin C.
- SUNSU-HT-012 Crema Hidratante Vitamin C Brightening.
- SUNSU-HT-013 Suero Iluminador Vitamin C Brightening.

Eyenlip (AS): SUNSU-AS-001 a SUNSU-AS-008. Nombres cortos (Aceite Limpiador, Tónico Centella, Bloqueador Aqua Relaxing Sun Cream SPF50+). No hay un solo envase oficial que coincida sin duda.

Dr.esthe (ML): SUNSU-ML-001 a SUNSU-ML-011.

APHLORA (PH): SUNSU-PH-001 a SUNSU-PH-012. Varios son suplementos o accesorios (Tool, Ring, Scarph) sin ficha de skincare.

Varios (JN): SUNSU-JN-001 a SUNSU-JN-004 (RiRe y protectores sin marca única en el nombre).

Bruno Vassari (BV): SUNSU-BV-001 Lab Tech Cryo SOS Cream 15ml.

SUNSU / otras marcas (SU): SUNSU-SU-001 a SUNSU-SU-009 (MATRIGEN, LAMINARIA, DR. REJU-ALL, SIDMOOL).

Los consumibles que solo viven en el inventario de cabina (discos, guantes, algodón y el resto de la hoja) no están en esta lista de 59. Sus fotos actuales se quedan. No se les busca una imagen de internet.

## Tareas de la construcción

1. Botones Abrí producto y Terminé producto en la beta, con los tres pasos de arriba, reusando `cabinaAbrirRapido` y sumando el destino. Los abiertos de hoy quedan en General.
2. Buscador único por nombre, ticket, código y cámara, en las pantallas donde ya se busca.
3. Ligar código de barras con un escaneo de admin, sin pisar el de otro producto. Columna en `erp_productos` y el mismo valor en la ficha de cabina cuando sea el mismo ítem.
4. Conteo físico de inicio sobre `erp_conteos`: una pieza a la vez, cámara, sin rellenar el contado, aplicar por diferencia.
5. Subir las 10 fotos Anua de la tabla a Storage, guardar `foto_url` y la URL de origen, y no reemplazar una foto que ya exista. El resto de la lista queda sin foto hasta tener el envase.

`sunsu.html`, `simetria.html` y el Apps Script no se tocan en esa construcción. La beta llama a la función `api`. Modo prueba sigue envolviendo las escrituras.
