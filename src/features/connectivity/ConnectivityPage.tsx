import { useState } from 'react';
import { useSession } from '../../app/session';
import { useApp } from '../../app/store';
import { ADAPTERS, manualEmgp, serial, simulator, startSimulation, stopSimulation, useNow } from '../../app/telemetry';
import { parseSamplesCsv } from '../../integrations/csv';
import { BleEssAdapter, BleNusAdapter } from '../../integrations/hardware/BleAdapters';
import { BAUD_RATES, SerialAdapter } from '../../integrations/hardware/SerialAdapter';
import type { TelemetryAdapter } from '../../integrations/adapter';
import { Button, Card, PageHeader, cx } from '../../shared/ui';
import { DevicesPanel } from './DevicesPanel';
import { TestConsole } from './TestConsole';

const STATE_STYLE: Record<string, string> = {
  conectado: 'text-emerald-300',
  desconectado: 'text-slate-400',
  conectando: 'text-sky-300',
  erro: 'text-red-300',
  nao_implementado: 'text-amber-300',
};

const INGEST_URL = `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '<projeto>'}.cloudfunctions.net/ingest`;

function support(a: TelemetryAdapter): string | null {
  if (a.id === 'usb-serial' && !SerialAdapter.supported())
    return 'USB indisponível neste navegador — use Chrome/Edge no computador ou o APK no celular';
  if ((a.id === 'ble-nus' || a.id === 'ble-ess') && !BleNusAdapter.supported())
    return 'Bluetooth indisponível neste navegador — use Chrome/Edge ou o APK (iPhone não suportado)';
  return null;
}

export default function ConnectivityPage() {
  useNow(1000);
  const { session } = useSession();
  const log = useApp((s) => s.adapterLog);
  const running = useApp((s) => s.simRunning);
  const pushLog = useApp((s) => s.pushLog);
  const devices = useApp((s) => s.devices);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [emgp, setEmgp] = useState('{"v":1,"dev":"esp32-hub","seq":1,"ch":{"t1":31.5}}');
  const [, force] = useState(0);
  const validated = devices.filter((d) => d.status === 'validado').length;

  const toggle = async (a: TelemetryAdapter) => {
    if (a === simulator) return running ? stopSimulation() : startSimulation();
    const st = a.status().state;
    if (st === 'conectado' || st === 'conectando') await a.disconnect();
    else await a.connect();
    force((n) => n + 1);
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="Conectividade"
        subtitle="Firebase não se conecta diretamente à moto. Toda leitura passa por um adaptador somente-leitura e por um dispositivo validado."
      />
      <Card title="Fluxo de dados">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {[
            ['Sensores externos / gateway próprio', `${devices.length} cadastrado(s)`, devices.length ? 'ok' : 'amber'],
            ['Transporte', 'USB · BLE · HTTPS', 'ok'],
            ['Protocolo EMGP v1', 'validação + sequência', 'ok'],
            ['Mapeamento + calibração', 'canal → componente', 'ok'],
            ['Validação do dispositivo', `${validated} validado(s)`, validated ? 'ok' : 'amber'],
            ['Telemetria REAL', validated ? 'ativa' : 'aguardando validação', validated ? 'ok' : 'amber'],
            ['Interface interna da EVS', 'bloqueada (não documentada)', 'amber'],
          ].map(([t, s, tone], i, arr) => (
            <div key={t} className="flex items-center gap-2">
              <div
                className={cx(
                  'rounded border px-2 py-1.5',
                  tone === 'ok' ? 'border-cyanx-400/50' : 'border-amber-400/40',
                )}
              >
                <div className="font-medium text-slate-200">{t}</div>
                <div className={tone === 'ok' ? 'text-cyanx-300' : 'text-amber-300'}>{s}</div>
              </div>
              {i < arr.length - 1 && <span className="text-cyanx-400">→</span>}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Adaptadores">
        <div className="grid gap-2 lg:grid-cols-2">
          {ADAPTERS.filter((a) => a !== manualEmgp).map((a) => {
            const st = a.status();
            const unsupported = support(a);
            const isOn = a === simulator ? running : st.state === 'conectado' || st.state === 'conectando';
            return (
              <div key={a.id} className="rounded-md border border-ink-700 p-3 text-sm" data-testid={`adapter-${a.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-200">{a.name}</div>
                    <div className="text-xs text-slate-500">
                      {a.kind} · v{st.version}
                    </div>
                  </div>
                  <span
                    className={cx(
                      'text-xs font-semibold uppercase',
                      STATE_STYLE[a === simulator && running ? 'conectado' : st.state],
                    )}
                  >
                    {(a === simulator && running ? 'conectado' : st.state).replace('_', ' ')}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{a.description}</p>
                {st.message && <p className="mt-1 text-xs text-slate-500">{st.message}</p>}
                {unsupported && <p className="mt-1 text-xs text-amber-300">{unsupported}</p>}
                {a.id === 'cloud-live' && session?.mode !== 'firebase' && (
                  <p className="mt-1 text-xs text-amber-300">Requer login Firebase.</p>
                )}
                <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                  <span>Amostras: {st.samplesReceived}</span>
                  <span>Última: {st.lastSampleAt ? new Date(st.lastSampleAt).toLocaleTimeString('pt-BR') : '—'}</span>
                  {a instanceof BleEssAdapter && a.devId && <span className="font-mono text-cyanx-300">{a.devId}</span>}
                  {a === serial && (
                    <select
                      className="input w-auto py-0.5 text-xs"
                      value={serial.baudRate}
                      disabled={isOn}
                      onChange={(e) => {
                        serial.baudRate = Number(e.target.value);
                        force((n) => n + 1);
                      }}
                      aria-label="Velocidade (baud)"
                    >
                      {BAUD_RATES.map((b) => (
                        <option key={b} value={b}>
                          {b} baud
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="ml-auto">
                    {a.id === 'evs-direct' ? (
                      <Button onClick={() => a.connect().then(() => force((n) => n + 1))}>Testar</Button>
                    ) : (
                      <Button disabled={!!unsupported} variant={isOn ? 'default' : 'primary'} onClick={() => toggle(a)}>
                        {isOn ? 'Desconectar' : 'Conectar'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <DevicesPanel />

      <div className="grid gap-3 lg:grid-cols-2">
        <TestConsole />
        <div className="space-y-3">
          <Card title="Injetar mensagem EMGP (sem hardware)">
            <p className="mb-2 text-xs text-slate-400">
              Cole uma ou mais linhas no formato do gateway. Útil para conferir cadastro e mapeamento. Se o dispositivo
              estiver validado, a leitura entra como REAL — use apenas para testes.
            </p>
            <textarea
              className="input h-24 font-mono text-xs"
              value={emgp}
              onChange={(e) => setEmgp(e.target.value)}
              aria-label="Linhas EMGP"
            />
            <div className="mt-2 flex gap-2">
              <Button onClick={() => manualEmgp.inject(emgp)} data-testid="emgp-inject">
                Enviar
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  setEmgp((t) => {
                    try {
                      const o = JSON.parse(t.trim().split('\n').pop()!);
                      o.seq = (o.seq ?? 0) + 1;
                      return JSON.stringify(o);
                    } catch {
                      return t;
                    }
                  })
                }
              >
                seq +1
              </Button>
            </div>
          </Card>
          <Card title="Ingestão pela internet (HTTPS)">
            <p className="text-xs text-slate-400">
              Para gateways com Wi-Fi/4G. Requer a Cloud Function implantada (ver docs/integration-manual).
            </p>
            <pre className="mt-2 overflow-auto rounded bg-ink-950 p-2 text-[11px] text-slate-300">{`POST ${INGEST_URL}
Authorization: Bearer <token do dispositivo>
Content-Type: application/x-ndjson

{"v":1,"dev":"<id>","seq":1,"ch":{"t1":31.5}}`}</pre>
          </Card>
          <Card title="Importação manual (CSV)">
            <p className="mb-2 text-xs text-slate-400">
              Colunas: timestamp_utc, componentId, quantity, value, unit. Entram como ESTIMADO/qualidade "suspeita" —
              nunca como REAL.
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              className="text-xs"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const { samples, errors } = parseSamplesCsv(await f.text());
                const ingest = useApp.getState().ingest;
                samples.forEach(ingest);
                const msg = `${samples.length} amostras importadas${errors.length ? `, ${errors.length} erro(s): ${errors.slice(0, 3).join('; ')}` : ''}`;
                setImportMsg(msg);
                pushLog('Importação CSV', { at: Date.now(), level: errors.length ? 'warn' : 'info', message: msg });
              }}
            />
            {importMsg && <p className="mt-2 text-xs text-slate-300">{importMsg}</p>}
          </Card>
        </div>
      </div>

      <Card title="Log de comunicação">
        {log.length ? (
          <ul className="max-h-72 space-y-0.5 overflow-auto font-mono text-xs">
            {log.map((e, i) => (
              <li
                key={i}
                className={
                  e.level === 'error' ? 'text-red-300' : e.level === 'warn' ? 'text-amber-300' : 'text-slate-400'
                }
              >
                {new Date(e.at).toLocaleTimeString('pt-BR')} [{e.adapter}] {e.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">Sem eventos.</p>
        )}
      </Card>
    </div>
  );
}
