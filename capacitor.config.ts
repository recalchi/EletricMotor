import type { CapacitorConfig } from '@capacitor/cli';

/** Empacotamento Android (APK) do mesmo app web. */
const config: CapacitorConfig = {
  appId: 'com.recalchi.eletricmotor',
  appName: 'EletricMotor',
  webDir: 'dist',
  android: {
    // WebView carregado em https://localhost (domínio já autorizado no Firebase Auth)
    allowMixedContent: false,
  },
  plugins: {
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
