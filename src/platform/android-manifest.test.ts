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
