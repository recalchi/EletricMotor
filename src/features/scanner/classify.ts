import type { BleAdvert } from '../../platform/ble';
import { USB_CLASS, type UsbAnyDevice } from '../../platform/serial';
import { uuid16 } from '../../platform/native';

/**
 * Classificação dos achados do scanner. Regra do projeto: nenhuma suposição vira fato.
 * As pistas abaixo são convenções PÚBLICAS e genéricas (nomes comuns de BMS, módulos UART BLE),
 * sempre rotuladas "não confirmado na EVS". Elas apenas ordenam o que vale explorar primeiro.
 */
export interface Clue {
  text: string;
  weight: number;
}

const NUS = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const has = (a: BleAdvert, u: string) => a.uuids.some((x) => x.toLowerCase() === u.toLowerCase());

export function advertClues(a: BleAdvert): Clue[] {
  const c: Clue[] = [];
  const name = a.name ?? '';
  if (/voltz|\bevs\b/i.test(name)) c.push({ text: 'Nome contém VOLTZ/EVS', weight: 50 });
  if (/bms|jbd|daly|jk[-_ ]?b|ant[-_ ]?bms|xiaoxiang|smart ?bat/i.test(name))
    c.push({ text: 'Nome típico de BMS (não confirmado na EVS)', weight: 30 });
  if (has(a, uuid16(0xff00))) c.push({ text: 'Serviço FF00 — comum em BMS genéricos (não confirmado)', weight: 20 });
  if (has(a, uuid16(0xffe0))) c.push({ text: 'Serviço FFE0 — módulo UART BLE genérico (tipo HM-10)', weight: 15 });
  if (has(a, NUS)) c.push({ text: 'Nordic UART — canal serial sobre BLE', weight: 20 });
  if (has(a, uuid16(0x180f))) c.push({ text: 'Battery Service padrão (0x180F)', weight: 10 });
  if (Object.keys(a.manufacturer).length)
    c.push({ text: `Dados de fabricante (id ${Object.keys(a.manufacturer).join(', ')})`, weight: 5 });
  if (a.rssi != null && a.rssi > -70) c.push({ text: `Sinal forte (${a.rssi} dBm) — está perto`, weight: 10 });
  return c;
}

export const advertScore = (a: BleAdvert) => advertClues(a).reduce((n, c) => n + c.weight, 0);

/** Candidatos a explorar automaticamente: pistas fortes (≥ 30) ou nome VOLTZ; no máximo `max`. */
export function pickCandidates(list: BleAdvert[], max = 3): BleAdvert[] {
  return [...list]
    .filter((a) => advertScore(a) >= 30)
    .sort((a, b) => advertScore(b) - advertScore(a))
    .slice(0, max);
}

export const isVoltzName = (n: string | null | undefined) => !!n && /voltz|\bevs\b/i.test(n);

export function describeUsb(d: UsbAnyDevice): string {
  const cls = [...new Set(d.interfaces.map((i) => USB_CLASS[i.class] ?? `classe 0x${i.class.toString(16)}`))];
  const id = `VID ${d.vendorId.toString(16).padStart(4, '0')} · PID ${d.productId.toString(16).padStart(4, '0')}`;
  const label = [d.manufacturer, d.product].filter(Boolean).join(' ') || 'Dispositivo USB';
  return `${label} (${id}) — ${cls.join(', ') || 'sem interfaces'}${d.serialDriver ? ' · driver serial disponível' : ''}`;
}

export type FindingLevel = 'ok' | 'info' | 'alerta';
export interface Finding {
  level: FindingLevel;
  title: string;
  detail: string;
  /** Dispositivo BLE que pode ser monitorado a partir do achado */
  ble?: { id: string; name: string };
}

export interface ExploreSummary {
  id: string;
  name: string;
  ok: boolean;
  services: number;
  chars: number;
  readable: number;
  notifying: number;
  notifications: number;
  standard: string[];
  error?: string;
}

/** Monta as conclusões em linguagem simples a partir do que foi observado. */
export function buildFindings(input: {
  native: boolean;
  bonded: { id: string; name: string | null }[];
  adverts: BleAdvert[];
  explored: ExploreSummary[];
  usb: { devices: UsbAnyDevice[]; hostSupported: boolean } | null;
}): Finding[] {
  const f: Finding[] = [];
  if (!input.native) {
    f.push({
      level: 'alerta',
      title: 'Varredura completa só no app Android',
      detail:
        'No navegador não é possível listar dispositivos Bluetooth/USB automaticamente. Use o APK, ou “Explorar dispositivo” em Captura.',
    });
    return f;
  }

  // Bluetooth clássico do painel
  const bondedVoltz = input.bonded.filter((b) => isVoltzName(b.name));
  const advVoltz = input.adverts.filter((a) => isVoltzName(a.name));
  for (const b of bondedVoltz) {
    if (!advVoltz.length)
      f.push({
        level: 'info',
        title: `“${b.name}” está pareado, mas só como Bluetooth clássico`,
        detail:
          'O painel aparece como aparelho de áudio/chamadas (perfis de música, telefone e contatos). Esse canal não transporta telemetria e não anunciou nenhum serviço BLE de dados durante a varredura.',
      });
  }

  // Explorações GATT
  for (const e of input.explored) {
    if (!e.ok) {
      f.push({
        level: 'alerta',
        title: `Não foi possível abrir “${e.name}”`,
        detail: `${e.error ?? 'Falha na conexão'}. Alguns dispositivos aceitam só uma conexão por vez (desconecte outros apps) ou exigem pareamento.`,
        ble: { id: e.id, name: e.name },
      });
      continue;
    }
    const data = e.notifications > 0;
    f.push({
      level: data ? 'ok' : 'info',
      title: data
        ? `“${e.name}” enviou ${e.notifications} notificação(ões) — fonte de dados candidata`
        : `“${e.name}” abriu, mas não enviou dados espontâneos`,
      detail:
        `${e.services} serviço(s), ${e.chars} característica(s), ${e.readable} legível(is), ${e.notifying} com notificação.` +
        (e.standard.length
          ? ` Padrões reconhecidos: ${e.standard.join(', ')}.`
          : ' Nenhum serviço padrão reconhecido.') +
        ' Os bytes foram gravados na captura; o significado só vira leitura REAL após validação.',
      ble: { id: e.id, name: e.name },
    });
  }

  if (!input.adverts.length)
    f.push({
      level: 'alerta',
      title: 'Nenhum anúncio Bluetooth LE recebido',
      detail: 'Verifique se o Bluetooth e a permissão “Dispositivos próximos” estão ativos e se a moto está ligada.',
    });
  else if (!input.explored.length)
    f.push({
      level: 'info',
      title: `${input.adverts.length} dispositivo(s) BLE por perto, nenhum com pistas fortes`,
      detail:
        'Nada se identificou como VOLTZ, BMS ou canal serial. Você pode escolher um da lista e explorar manualmente.',
    });

  // USB
  if (input.usb) {
    if (!input.usb.hostSupported)
      f.push({ level: 'alerta', title: 'Este celular não informa suporte a USB host (OTG)', detail: '' });
    else if (!input.usb.devices.length)
      f.push({
        level: 'info',
        title: 'Nenhum dispositivo de dados no USB',
        detail:
          'Com o celular ligado na porta USB da moto, só há carga (5 V). Essa porta não troca dados com o celular. Para USB é preciso um gateway próprio (ESP32/adaptador) ligado por cabo OTG.',
      });
    else
      for (const d of input.usb.devices)
        f.push({
          level: d.serialDriver ? 'ok' : 'info',
          title: d.serialDriver ? 'Dispositivo USB serial detectado' : 'Dispositivo USB detectado (sem driver serial)',
          detail: describeUsb(d),
        });
  }
  return f;
}
