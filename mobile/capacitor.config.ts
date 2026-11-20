import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Sunsu Spa · app nativa iOS.
 * La web de producción (raíz del repo) se copia a `www/` con `npm run sync:web` y va EMPAQUETADA
 * dentro del .ipa (no es un WebView remoto). El backend sigue siendo la Edge Function `api` de
 * Supabase (CORS `*`), igual que en https://app.sunsuspa.com/.
 */
const config: CapacitorConfig = {
  appId: 'com.sunsuspa.app',
  appName: 'Sunsu',
  webDir: 'www',
  loggingBehavior: 'debug',
  ios: {
    scheme: 'App',
    // Arriba: StatusBar overlaysWebView=false. Abajo (home indicator): CSS env(safe-area-inset-bottom).
    contentInset: 'never',
    backgroundColor: '#F5F0E8',
    allowsLinkPreview: false,
    limitsNavigationsToAppBoundDomains: false,
    preferredContentMode: 'mobile',
    scrollEnabled: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false,
      launchFadeOutDuration: 250,
      backgroundColor: '#F5F0E8',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      splashFullScreen: false,
      splashImmersive: false,
    },
    // La barra de estado NO tapa la web: el notch / Dynamic Island nunca cubre el encabezado.
    // El puente nativo la pinta azul Sunsu (#3D5A7A) dentro de la app y celeste claro en el login.
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#EEF3FA',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
    CapacitorHttp: { enabled: false },
  },
};

export default config;
