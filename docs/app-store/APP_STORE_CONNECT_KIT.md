# Sunsu · Kit para App Store Connect (iOS)

Todo lo necesario para publicar la app nativa **Sunsu** (`com.sunsuspa.app`) con tu cuenta de Apple Developer.
Proyecto Xcode: `mobile/ios/App` · Workflow: `.github/workflows/ios-appstore.yml` · Capturas: `docs/app-store/screenshots/iphone-6.9/`.

---

## 1. Datos para copiar y pegar

| Campo | Valor |
|---|---|
| **Nombre** (máx. 30) | `Sunsu` |
| **Subtítulo** (máx. 30) | `Gestión interna del spa` |
| **Bundle ID** | `com.sunsuspa.app` |
| **SKU** | `sunsuspa-ios-001` |
| **Idioma principal** | Español (México) |
| **Categoría principal / secundaria** | Negocios / Productividad |
| **Clasificación por edad** | 4+ (responder «Ninguno / No» a todo el cuestionario) |
| **Copyright** | `2026 SUNSU S.A.` |
| **URL de privacidad** | https://app.sunsuspa.com/privacy.html |
| **URL de soporte** | https://app.sunsuspa.com/support.html |
| **URL de marketing** (opcional) | https://www.sunsuspa.com |
| **Versión / Build** | 1.0.0 / el número de ejecución del workflow (o 1 desde Xcode) |
| **Cifrado (export compliance)** | Ya declarado en `Info.plist`: `ITSAppUsesNonExemptEncryption = NO` (solo HTTPS estándar) |
| **Dispositivos** | Solo iPhone (en iPad corre en modo compatibilidad; así no se piden capturas de iPad) |

**Texto promocional** (máx. 170)
> La app del equipo de Sunsu Spa: tickets, pagos con comprobante por cámara, fichas de clientas, inventario, asistencia y comisiones, todo desde el iPhone.

**Descripción**
> Sunsu es la herramienta interna del equipo de Sunsu Spa, spa de cuidado facial en Cumbayá, Quito. Reúne en el iPhone la operación diaria del spa:
>
> • Tickets de venta y pagos: registra faciales, paquetes, productos y gift cards; adjunta el comprobante de pago con la cámara.
> • Fichas de clientas: historial de visitas, paquetes activos, fotos antes/después de cada tratamiento y documentos.
> • Dashboard del día: ventas, faciales, productos y alertas al instante.
> • Inventario y compras: conteos, recepciones, transferencias y códigos de barras con la cámara.
> • Asistencia: reloj de entrada y salida con foto.
> • Comisiones: cada cosmetóloga ve su ciclo y el detalle de su comisión.
> • PDFs (ficha de clienta, control de paquetes, gift cards) que se comparten por WhatsApp o Mail con la hoja nativa de iOS, e impresión AirPrint.
>
> Acceso solo para el personal de Sunsu Spa con cuenta creada por la administración. Sin publicidad y sin rastreo.

**Palabras clave** (máx. 100, sin espacios después de las comas)
```
spa,facial,tickets,clientas,comisiones,inventario,cosmetología,asistencia,gift card,Quito
```

**Capturas iPhone 6.9"** (1320 × 2868, RGB sin alfa, datos 100 % ficticios; sin márgenes, ingresos, comisiones, costos ni totales de venta), en este orden:

| Archivo | Pantalla |
|---|---|
| `01-login.png` | Acceso con PIN |
| `02-inventario.png` | Inventario de faciales (nombres y categoría, sin costos) |
| `03-catalogo.png` | Carta de tratamientos con PVP de menú |
| `04-ficha.png` | Ficha de clienta ficticia con carpetas de Skin Analysis, K-Lift y tratamientos |
| `05-agenda.png` | Agenda del día (citas y tratamientos, sin montos) |

Los nombres y el PVP de la carta (`03-catalogo.png`) salen del catálogo en vivo (`public.catalogo.total_con_iva`, que coincide con `erp_productos.precio_venta`; no hay `beta_pvp` de override). No se inventan faciales ni precios.

App Store Connect reutiliza las de 6.9" para los demás tamaños de iPhone.

---

## 2. Estrategia de distribución recomendada

Las dos opciones usan tu misma cuenta de Apple Developer y App Store Connect, y pasan por App Review.

| | **App no listada (Unlisted)** ✅ recomendada | **App Store público** |
|---|---|---|
| Quién la encuentra | Solo quien tenga el enlace directo (no aparece en búsquedas ni categorías) | Cualquiera en el App Store |
| Ideal para | Apps internas de un negocio y su personal | Apps para el público general |
| Riesgo en App Review | Bajo: Apple espera que una app de personal no sea pública (evita fricción con las guías 3.2 y 4.2) | Más preguntas: «¿para quién es?», cuenta demo obligatoria |
| Cómo | Publicar la versión normal → luego enviar la [solicitud de distribución no listada](https://developer.apple.com/support/unlisted-app-distribution/) con el Apple ID de la app | Publicar normal |
| Actualizaciones | Igual que cualquier app (las del equipo se actualizan solas) | Igual |

**Mientras tanto, TestFlight**: con el build en TestFlight el equipo ya puede instalarla (hasta 100 testers internos que sean usuarios de App Store Connect, sin revisión; o testers externos por enlace público tras una revisión beta breve). Cada build de TestFlight dura 90 días.

> **Importante (web empaquetada):** la app lleva la web de `app.sunsuspa.com` **dentro** del .ipa (requisito para que Apple no la rechace como «solo un sitio web»). Las mejoras que se publiquen en la web llegan a la app de iPhone al generar un build nuevo (workflow → TestFlight → «Enviar a revisión»). El backend (Supabase) es el mismo, así que los datos siempre son los mismos en web y app.

---

## 3. Privacidad de la app («etiquetas nutricionales») — respuestas exactas

**¿Recopilas datos?** → **Sí**.
Para **cada** tipo de dato de la tabla: *Uso* = **Funcionalidad de la app** (solo esa casilla) · *¿Vinculado a la identidad?* = **Sí** · *¿Se usa para rastreo?* = **No**.

| Categoría en App Store Connect | Tipo de dato | Por qué |
|---|---|---|
| Información de contacto | **Nombre** | Cuentas del personal y fichas de clientas |
| Información de contacto | **Correo electrónico** | Usuario del personal (recuperar contraseña) y datos de facturación de clientas |
| Información de contacto | **Número de teléfono** | Contacto de clientas (WhatsApp) |
| Ubicación | **Ubicación precisa** | Solo al marcar entrada/salida en el reloj de asistencia |
| Contenido del usuario | **Fotos o videos** | Fotos de tratamientos, comprobantes de pago, foto del reloj |
| Compras | **Historial de compras** | Tickets, paquetes y gift cards de clientas |
| Identificadores | **ID de usuario** | Cuenta interna del personal |

No marcar: Salud, Finanzas (no se guardan tarjetas), Navegación, Búsquedas, Diagnóstico, Datos de uso, Publicidad, Rastreo.
(Coincide con el *Privacy Manifest* `mobile/ios/App/App/PrivacyInfo.xcprivacy`: `NSPrivacyTracking = false`, sin dominios de rastreo.)

> ⚠️ **IA de terceros (guía 5.1.2(i))**: la lectura automática de comprobantes de pago envía la imagen del comprobante a **Anthropic** (proveedor de IA) desde el servidor. Ya está declarado en la política de privacidad. Si Apple lo pregunta, la respuesta es: «Solo el personal autorizado adjunta comprobantes; la imagen se usa únicamente para leer monto y referencia, y una persona revisa el resultado».

---

## 4. Notas para App Review

**English (pegar en «Notas»):**
> Sunsu is the internal operations app for the staff of Sunsu Spa, a facial-care spa in Cumbayá, Quito, Ecuador (SUNSU S.A.). Accounts are created by the spa's administration; there is no public sign-up. We plan to distribute it as an Unlisted App.
> Demo account (restricted demo role, contains no real client data): **User:** `<<usuario demo>>` · **Password:** `<<contraseña demo>>` — on the login screen tap «Usuario y contraseña».
> Native features: camera / photo library sheet for treatment photos and payment receipts, native iOS Share Sheet for generated PDFs (client record, package control, gift cards), AirPrint for reports, haptic feedback, offline banner, location only at clock-in/clock-out.
> Camera, Photos and Location are requested only when the user starts those actions. No tracking, no ads, no analytics SDKs.
> Privacy: https://app.sunsuspa.com/privacy.html · Support: https://app.sunsuspa.com/support.html

**Español:**
> Sunsu es la app interna del personal de Sunsu Spa (Cumbayá, Quito). Las cuentas las crea la administración; no hay registro público. Cuenta de demostración con rol restringido y sin datos reales de clientas: usuario `<<usuario demo>>`, contraseña `<<contraseña demo>>` (pestaña «Usuario y contraseña»).

**Cómo preparar la cuenta demo segura (hacerlo antes de enviar a revisión):**
1. En la app (web) › Usuarios: crear la persona «Apple Review» con usuario y contraseña propios (nada de PIN de una persona real).
2. Darle un rol de **solo lectura** limitado a módulos sin datos personales de clientas (p. ej. Dashboard del día, Productos, Inventario, Asistencia) y **sin** Clientes, Caja, Costos ni Comisiones de otras personas. Si se activa el «Modo prueba», todo lo que haga queda marcado como PRUEBA.
3. Probar ese usuario en un iPhone (TestFlight) antes de enviarlo.
4. Desactivar la cuenta cuando Apple apruebe la app.

---

## 5. Primer build en TestFlight — 5 pasos

### Opción A · Sin Mac (GitHub Actions, recomendado)
1. **Identificador:** [developer.apple.com › Certificates, IDs & Profiles › Identifiers](https://developer.apple.com/account/resources/identifiers/list) › **+** › App IDs › App › Bundle ID explícito `com.sunsuspa.app`, descripción «Sunsu» (sin capacidades extra).
2. **App en App Store Connect:** [appstoreconnect.apple.com](https://appstoreconnect.apple.com) › Apps › **+ Nueva app** › iOS · Nombre `Sunsu` · Español (México) · Bundle ID `com.sunsuspa.app` · SKU `sunsuspa-ios-001` · Acceso completo.
3. **Llave API:** App Store Connect › Usuarios y acceso › Integraciones › App Store Connect API › **Generar llave** con rol **Admin** (permite la firma automática en la nube sin Mac). Descarga el `.p8` (solo se puede bajar una vez) y anota **Key ID** e **Issuer ID**. El **Team ID** está en developer.apple.com › Membership.
4. **Secretos en GitHub** (repo › Settings › Secrets and variables › Actions), mínimo 4:
   - `APPLE_TEAM_ID`
   - `APP_STORE_CONNECT_API_KEY_ID`
   - `APP_STORE_CONNECT_ISSUER_ID`
   - `APP_STORE_CONNECT_API_KEY_P8_BASE64` (= `base64 -i AuthKey_XXXX.p8`)
   - *(Opcional, firma manual)* `IOS_DIST_CERT_P12_BASE64`, `IOS_DIST_CERT_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64` (certificado *Apple Distribution* .p12 y perfil *App Store* de `com.sunsuspa.app`). Si están, el workflow firma con ellos; si no, usa firma automática con la llave API.
5. **Subir:** GitHub › Actions › **iOS App Store** › *Run workflow* › marcar **deploy_testflight** › Run. En 15–30 min el build aparece en App Store Connect › TestFlight. Agrega testers internos (el equipo) y, cuando quieras publicar: completa las fichas de este kit › **Enviar a revisión** › al aprobarse, solicita la distribución **no listada**.

### Opción B · Con Mac + Xcode 26
```bash
git clone https://github.com/estebanfch-cell/sunsu-spa && cd sunsu-spa/mobile
npm ci && npm run sync:ios && npx cap open ios
```
En Xcode: target **App** › Signing & Capabilities › Team = tu equipo (firma automática) › Product › **Archive** › Distribute App › **App Store Connect** › Upload.

---

## 6. Qué incluye la app nativa (resumen técnico)

- Capacitor 8 (iOS 15+), web **empaquetada** en el `.ipa` (`mobile/scripts/sync-web.mjs`), mismo backend Supabase.
- Plugins nativos: Cámara/Galería, Compartir + Archivos (PDFs), Haptics, Barra de estado, Splash, Teclado, App (primer plano), Navegador in-app (SFSafariViewController), Red (aviso sin conexión), App Launcher (WhatsApp / teléfono / mail) y plugin propio `SunsuNative.printHtml` (AirPrint).
- `Info.plist`: textos de permisos en español (cámara, fotos, guardar en fotos, ubicación al marcar asistencia), `LSApplicationQueriesSchemes` (whatsapp, tel, mailto), `ITSAppUsesNonExemptEncryption = NO`.
- `PrivacyInfo.xcprivacy` incluido en el bundle (sin rastreo; razones CA92.1, C617.1, E174.1, 35F9.1).
- Icono 1024 × 1024 RGB sin alfa y splash con el logo oficial (`mobile/scripts/generate-ios-assets.py`).
