import { useEffect, useState } from 'react';
import { live } from '../../app/liveLog';
import { Link } from 'react-router-dom';
import { useBench } from '../../app/benchStore';
import { useApp } from '../../app/store';
import { bleNus, cloud, serial, useNow } from '../../app/telemetry';
import { useCollection } from '../../data/hooks';
import type { DeviceProfile } from '../../domain/types';
import { GATEWAY_DEV, GATEWAY_NICK, benchChecks, gatewayDevice, nextStep, type BenchCheck, type CheckStatus } from '../../integrations/bench';
import { saveTextFile } from '../../platform/files';
import { Button, Card, cx } from '../../shared/ui';

const ICON: Record<CheckStatus, string> = { ok: '✓', pendente: '○', aguardando_hw: '⏳', opcional: '·' };
const TONE: Record<CheckStatus, string> = {
  ok: 'text-emerald-300',
  pendente: 'text-amber-300',
  aguardando_hw: 'text-slate-400',
  opcional: 'text-slate-500',
};
const GROUPS: [BenchCheck['group'], string][] = [
  ['conexao', 'Conexão'],
  ['bancada', 'Testes de bancada (só jumpers)'],
  ['sensores', 'Sensores'],
  ['cadastro', 'Cadastro e validação'],
];

/** Mapa de ligações da bancada — o mesmo do firmware 1.1.0. */
const WIRING = [
  ['GPIO34 → 3V3 / GND', 'tensão (v34)'],
  ['GPIO27 → GND', 'entrada digital (d27)'],
  ['GPIO13 + dedo', 'toque (tq13)'],
  ['GPIO4 + 4,7 kΩ → 3V3', 'DS18B20 (t1) — quando chegar'],
];

function report(checks: BenchCheck[], extra: string) {
  return [
    `# Bateria de testes do gateway ${GATEWAY_DEV}`,
    `Gerado em ${new Date().toLocaleString('pt-BR')}`,
    '',
    ...checks.map((c) => `- [${c.status === 'ok' ? 'x' : ' '}] ${c.label} — ${c.status}: ${c.detail}`),
    '',
    extra,
  ].join('\n');
}

/** Assistente: conectar, identificar, testar na bancada, cadastrar e validar o gateway ESP32, com próximo passo. */
export function GatewayBench() {
  useNow(1000);
  const bench = useBench((s) => s.bench);
  const reset = useBench((s) => s.reset);
  const devices = useApp((s) => s.devices);
  const repoDevices = useCollection<DeviceProfile>('devices');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const dev = devices.find((d) => d.id === GATEWAY_DEV);
  const checks = benchChecks(bench, {
    registered: !!dev,
    validated: dev?.status === 'validado',
    cloudConnected: cloud.status().state === 'conectado',
  });
  const done = checks.filter((c) => c.status === 'ok').length;
  const counted = checks.filter((c) => c.status !== 'opcional').length;
  const next = nextStep(checks);
  const sig = checks.map((c) => `${c.id}:${c.status}`).join(',');
  useEffect(() => logCheckChanges(checks), [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const usbOn = ['conectado', 'conectando'].includes(serial.status().state);
  const bleOn = ['conectado', 'conectando'].includes(bleNus.status().state);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setErr(null);
    setBusy(id);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  // ?auto=usb (atalho do PC): reconecta sozinho à porta já autorizada, sem precisar tocar em Conectar USB
  useEffect(() => {
    if (autoTried || new URLSearchParams(location.search).get('auto') !== 'usb' || usbOn) return;
    autoTried = true;
    live('acao', 'conexão USB automática (?auto=usb)');
    void act('usb', () => serial.connect({ grantedOnly: true }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card
      title={`Assistente do ${GATEWAY_NICK} (gateway ESP32) — bateria de testes`}
      right={
        <span className="text-xs text-slate-300" data-testid="bench-progress">
          {done}/{counted} ok
        </span>
      }
    >
      {next ? (
        <div className="mb-3 rounded border border-cyanx-400/50 bg-cyanx-500/10 p-3 text-sm" data-testid="bench-next">
          <div className="text-[11px] uppercase tracking-wider text-cyanx-300">Próximo passo</div>
          <div className="font-medium text-white">{next.label}</div>
          <div className="text-slate-300">{next.howTo}</div>
        </div>
      ) : (
        <div className="mb-3 rounded border border-emerald-400/50 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          Tudo o que dá para testar com o hardware atual passou. Itens com ⏳ aguardam peças.
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          variant={usbOn ? 'default' : 'primary'}
          disabled={busy !== null || bleOn}
          onClick={() => act('usb', () => (usbOn ? serial.disconnect() : serial.connect()))}
        >
          {usbOn ? 'Desconectar USB' : 'Conectar USB'}
        </Button>
        <Button
          variant={bleOn ? 'default' : 'primary'}
          disabled={busy !== null || usbOn}
          onClick={() => act('ble', () => (bleOn ? bleNus.disconnect() : bleNus.connect()))}
        >
          {bleOn ? 'Desconectar Bluetooth' : 'Conectar Bluetooth'}
        </Button>
        {!dev && (
          <Button disabled={busy !== null} onClick={() => act('cad', () => repoDevices.add(gatewayDevice()))}>
            Cadastrar gateway
          </Button>
        )}
        <Link to="/firmware" className="inline-flex items-center rounded-md px-3 py-1.5 text-sm text-cyanx-300 ring-1 ring-ink-600">
          Firmware
        </Link>
        <Button
          variant="ghost"
          onClick={() =>
            saveTextFile(
              `bateria-gateway-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.md`,
              report(checks, `Última mensagem: canais ${JSON.stringify(Object.fromEntries(Object.entries(bench.ch).map(([k, r]) => [k, r.last])))} · status ${JSON.stringify(bench.st)}`),
            )
          }
        >
          Exportar relatório
        </Button>
        <Button variant="ghost" onClick={reset}>
          Recomeçar
        </Button>
      </div>
      {err && <p className="mb-2 text-sm text-red-300">{err}</p>}

      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          {GROUPS.map(([g, title]) => (
            <div key={g}>
              <div className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">{title}</div>
              <ul className="space-y-1">
                {checks
                  .filter((c) => c.group === g)
                  .map((c) => (
                    <li key={c.id} className="flex gap-2 text-sm" data-testid={`bench-${c.id}`}>
                      <span className={cx('w-4 text-center', TONE[c.status])}>{ICON[c.status]}</span>
                      <div className="min-w-0">
                        <span className="text-slate-200">{c.label}</span>
                        <div className="text-[11px] text-slate-400">{c.detail}</div>
                        {c.status !== 'ok' && c !== next && <div className="text-[11px] text-slate-500">{c.howTo}</div>}
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="rounded border border-ink-700 p-3 text-xs lg:w-64">
          <div className="mb-1 font-medium text-slate-300">Ligações na protoboard</div>
          <table className="w-full">
            <tbody>
              {WIRING.map(([w, what]) => (
                <tr key={w}>
                  <td className="py-0.5 pr-2 font-mono text-cyanx-300">{w}</td>
                  <td className="py-0.5 text-slate-400">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-slate-500">
            Só jumpers entre pinos do próprio ESP32 (3V3 e GND da placa). Nunca ligue nada da moto à protoboard nesta fase.
          </p>
          {bench.lastAt && (
            <p className="mt-2 text-[11px] text-slate-500">
              Última mensagem há {Math.round((Date.now() - bench.lastAt) / 1000)} s · {bench.messages} recebidas
              {bench.st.up != null ? ` · placa ligada há ${bench.st.up} s` : ''}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

let autoTried = false;
const lastStatus = new Map<string, CheckStatus>();
/** Canal ao vivo (PC): registra só as verificações que mudaram de estado. */
function logCheckChanges(checks: BenchCheck[]) {
  const first = lastStatus.size === 0;
  for (const c of checks) {
    if (lastStatus.get(c.id) === c.status) continue;
    if (!first) live('check', `${c.status === 'ok' ? '✓' : '·'} ${c.label}: ${c.status} — ${c.detail}`);
    lastStatus.set(c.id, c.status);
  }
}
