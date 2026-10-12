import type { CapacitorConfig } from '@capacitor/cli';

/** Empacotamento Android (APK) do mesmo app web. */
const config: CapacitorConfig = {
  appId: 'com.recalchi.eletricmotor',
  appName: 'EletricMotor',
  webDir: 'dist',
  android: {
    // WebView carregado em https://localhost (domínio já autorizado no Firebase Auth)
    allowMixedContent: false,
    backgroundColor: '#030a14',
    // Android 15+ desenha atrás das barras do sistema: o Capacitor ajusta as margens do WebView
    adjustMarginsForEdgeToEdge: 'auto',
  },
  plugins: {
    // Login Google nativo; a sessão é criada no Firebase JS SDK (signInWithCredential)
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com'],
    },
    BluetoothLe: {
      displayStrings: {
        scanning: 'Procurando dispositivos…',
        cancel: 'Cancelar',
        availableDevices: 'Dispositivos disponíveis',
        noDeviceFound: 'Nenhum dispositivo encontrado',
      },
    },
  },
};

export default config;
