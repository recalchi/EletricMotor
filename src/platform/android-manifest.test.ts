import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('manifesto Android', () => {
  it('busca Bluetooth sem localização: initialize(androidNeverForLocation) exige neverForLocation no manifesto', () => {
    // Sem a flag, o Android 12+ devolve a busca vazia ("Procurando dispositivos…" para sempre) — aconteceu no 0.8.0
    expect(read('src/platform/ble.ts')).toContain('androidNeverForLocation: true');
    expect(read('android/app/src/main/AndroidManifest.xml')).toMatch(
      /android\.permission\.BLUETOOTH_SCAN"\s+android:usesPermissionFlags="neverForLocation"/,
    );
  });
});

describe('versão do app', () => {
  it('APP_VERSION (relatórios e envio de scans) acompanha o versionName do APK', () => {
    const gradle = /versionName "([^"]+)"/.exec(read('android/app/build.gradle'))![1];
    expect(read('src/app/diagnostics.ts')).toContain(`APP_VERSION = '${gradle}'`);
  });
});
