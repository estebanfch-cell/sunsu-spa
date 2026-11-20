# Sunsu Spa · app iOS (Capacitor 8)

La web de producción (raíz del repo, la misma de https://app.sunsuspa.com/) va **empaquetada** dentro del `.ipa`.
Nada de esta carpeta se publica como parte de la app web; la raíz solo ganó `privacy.html`, `support.html` y el enlace
discreto «Privacidad · Soporte» en el login.

```bash
cd mobile
npm ci
npm test            # pruebas del empaquetado y del puente nativo
npm run sync:ios    # copia la web a www/ (+ puente nativo) y la sincroniza con ios/App/App/public
npx cap open ios    # (Mac) abre Xcode
```

- `bridge/native-ios-bridge.js` — mejoras nativas; **solo** se activan si `window.Capacitor.isNativePlatform()`.
- `bridge/native-ios.css` — estilos solo para la app nativa.
- `scripts/sync-web.mjs` — copia la web y agrega `viewport-fit=cover` + puente (la raíz no se toca).
- `scripts/generate-ios-assets.py` — icono 1024 RGB sin alfa + splash desde `assets/sunsu-logo-celeste.png`.
- `ios/App/App/SunsuNativePlugin.swift` — AirPrint de reportes (`SunsuNative.printHtml`).
- CI: `.github/workflows/ios-appstore.yml` (compilación Xcode en macOS y subida a TestFlight).
- Publicación: `docs/app-store/APP_STORE_CONNECT_KIT.md`.
