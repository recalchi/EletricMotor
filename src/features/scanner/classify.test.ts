import { describe, expect, it } from 'vitest';
import type { BleAdvert } from '../../platform/ble';
import type { UsbAnyDevice } from '../../platform/serial';
import { advertScore, buildFindings, describeUsb, pickCandidates, type ExploreSummary } from './classify';

const adv = (p: Partial<BleAdvert>): BleAdvert => ({
  id: p.id ?? 'AA:BB',
  name: null,
  rssi: -80,
  txPower: null,
  uuids: [],
  manufacturer: {},
  serviceData: {},
  raw: null,
  seen: 1,
  ...p,
});

describe('scanner — classificação', () => {
  it('prioriza nome VOLTZ e BMS, ignora dispositivos sem pistas', () => {
    const list = [
      adv({ id: '1', name: 'Galaxy Buds' }),
      adv({ id: '2', name: 'VOLTZ' }),
      adv({ id: '3', name: 'JBD-SP04S034', uuids: ['0000ff00-0000-1000-8000-00805f9b34fb'] }),
      adv({ id: '4', name: null, rssi: -50 }),
    ];
    expect(pickCandidates(list).map((a) => a.id)).toEqual(['2', '3']);
    expect(advertScore(list[0])).toBe(0);
  });

  it('VOLTZ só pareado (clássico) e sem anúncio BLE → explica que é áudio/chamadas', () => {
    const f = buildFindings({
      native: true,
      bonded: [{ id: 'X', name: 'VOLTZ' }],
      adverts: [adv({ name: 'TV Sala' })],
      explored: [],
      usb: { devices: [], hostSupported: true },
    });
    expect(f.some((x) => /Bluetooth clássico/.test(x.title))).toBe(true);
    expect(f.some((x) => /Nenhum dispositivo de dados no USB/.test(x.title))).toBe(true);
  });

  it('dispositivo explorado com notificações vira fonte candidata (nunca REAL direto)', () => {
    const e: ExploreSummary = {
      id: '2',
      name: 'VOLTZ',
      ok: true,
      services: 3,
      chars: 6,
      readable: 2,
      notifying: 1,
      notifications: 12,
      standard: ['Device Information'],
    };
    const f = buildFindings({ native: true, bonded: [], adverts: [adv({ name: 'VOLTZ' })], explored: [e], usb: null });
    const hit = f.find((x) => x.ble?.id === '2');
    expect(hit?.level).toBe('ok');
    expect(hit?.detail).toMatch(/após validação/);
  });

  it('no navegador avisa que a varredura completa é só no app', () => {
    const f = buildFindings({ native: false, bonded: [], adverts: [], explored: [], usb: null });
    expect(f).toHaveLength(1);
    expect(f[0].level).toBe('alerta');
  });

  it('descreve USB com VID/PID e classe', () => {
    const d: UsbAnyDevice = {
      deviceId: 1,
      vendorId: 0x10c4,
      productId: 0xea60,
      deviceClass: 0,
      manufacturer: 'Silicon Labs',
      product: 'CP2102',
      interfaces: [{ class: 0xff, subclass: 0, protocol: 0, endpoints: 2 }],
      serialDriver: true,
      permission: false,
    };
    expect(describeUsb(d)).toBe(
      'Silicon Labs CP2102 (VID 10c4 · PID ea60) — Específica do fabricante · driver serial disponível',
    );
  });
});
