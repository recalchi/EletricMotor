import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDiag, startCapture } from '../../app/diagnostics';
import { bleExplorer, type ExplorerState } from '../../integrations/hardware/BleExplorer';
import { bleSupported } from '../../platform/ble';
import { isNative } from '../../platform/native';
import { Button, Card, PageHeader, cx } from '../../shared/ui';
import { Icon } from '../../shared/ui/icons';
import { Explorer } from '../capture/CapturePage';
import { EXPLORE_MS, SCAN_MS, STEPS, cancelScan, monitorDevice, runAutoScan, useScan } from './autoScan';
import { advertClues, advertScore, describeUsb, type Finding } from './classify';

const LEVEL: Record<Finding['level'], string> = {
  ok: 'border-emerald-500/50 bg-emerald-500/10',
  info: 'border-cyanx-500/40 bg-cyanx-500/5',
  alerta: 'border-amber-400/50 bg-amber-500/10',
};
const LEVEL_ICON: Record<Finding['level'], string> = {
  ok: 'text-emerald-300',
  info: 'text-cyanx-300',
  alerta: 'text-amber-300',
};

function useExplorer() {
  const [st, setSt] = useState<ExplorerState>(bleExplorer.state);
  useEffect(() => bleExplorer.onChange(setSt), []);
  return st;
}

/** Botão grande do scanner, usado também na Central de Controle. */
export function ScanHero({ compact }: { compact?: boolean }) {
  const running = useScan((s) => s.running);
  return (
    <div
      className={cx(
        'panel relative overflow-hidden',
        compact ? 'flex items-center gap-4 p-4' : 'flex flex-col items-center gap-4 p-6 text-center',
      )}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyanx-500/10 blur-2xl" />
      <Link
        to="/scanner"
        onClick={() => {
          if (!running) void runAutoScan();
        }}
        className={cx(
          'relative grid shrink-0 place-items-center rounded-full bg-cyanx-500 text-ink-950 shadow-glow transition active:scale-95',
          compact ? 'h-16 w-16' : 'h-32 w-32',
        )}
        aria-label="Escanear a moto automaticamente"
        data-testid="scan-start"
      >
        {running && <span className="absolute inset-0 animate-ping rounded-full bg-cyanx-400/40" />}
        <Icon name="radar" className={compact ? 'h-8 w-8' : 'h-14 w-14'} />
      </Link>
      <div className="relative min-w-0">
        <div className={cx('font-semibold text-white', compact ? 'text-base' : 'text-lg')}>
          {running ? 'Escaneando…' : 'Escanear a moto'}
        </div>
        <p className="text-xs text-slate-400">
          Procura automaticamente Bluetooth e USB, lê o que for possível (sem enviar nada à moto) e grava tudo para
          análise.
        </p>
      </div>
    </div>
  );
}

function Progress() {
  const s = useScan();
  const idx = STEPS.findIndex((x) => x.id === s.step);
  return (
    <Card
      title="Varredura em andamento"
      right={
        <Button onClick={cancelScan} data-testid="scan-cancel">
          Parar
        </Button>
      }
    >
      <ol className="space-y-2">
        {STEPS.map((st, i) => (
          <li key={st.id} className="flex items-start gap-3 text-sm">
            <span
              className={cx(
                'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold',
                i < idx
                  ? 'bg-emerald-500 text-ink-950'
                  : i === idx
                    ? 'animate-pulse bg-cyanx-500 text-ink-950'
                    : 'bg-ink-700 text-slate-400',
              )}
            >
              {i < idx ? <Icon name="check" className="h-3 w-3" /> : i + 1}
            </span>
            <div className="min-w-0">
              <div className={i === idx ? 'text-white' : i < idx ? 'text-slate-300' : 'text-slate-500'}>{st.label}</div>
              {i === idx && s.stepDetail && <div className="text-xs text-slate-400">{s.stepDetail}</div>}
              {st.id === 'ble' && i <= idx && (
                <div className="text-xs text-cyanx-300">{s.adverts.length} dispositivo(s) Bluetooth LE encontrados</div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Findings() {
  const s = useScan();
  const ex = useExplorer();
  if (!s.finishedAt) return null;
  const secs = s.startedAt ? Math.round((s.finishedAt - s.startedAt) / 1000) : 0;
  return (
    <Card title="Resultado" right={<span className="text-[11px] text-slate-500">{secs} s</span>}>
      {s.error && <p className="mb-2 rounded bg-red-500/10 p-2 text-xs text-red-200">{s.error}</p>}
      <ul className="space-y-2">
        {s.findings.map((f, i) => (
          <li key={i} className={cx('rounded-md border p-3', LEVEL[f.level])}>
            <div className="flex items-start gap-2">
              <Icon
                name={f.level === 'ok' ? 'check' : f.level === 'alerta' ? 'alert' : 'eye'}
                className={cx('mt-0.5 h-4 w-4 shrink-0', LEVEL_ICON[f.level])}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-100">{f.title}</div>
                {f.detail && <p className="mt-0.5 text-xs text-slate-300">{f.detail}</p>}
                {f.ble && (
                  <Button
                    className="mt-2"
                    variant="primary"
                    disabled={ex.status === 'conectando' || ex.status === 'explorando'}
                    onClick={() => void monitorDevice(f.ble!.id, f.ble!.name)}
                  >
                    Monitorar ao vivo
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => void runAutoScan()}>
          <Icon name="reset" /> Escanear de novo
        </Button>
        <Link
          to="/captura"
          className="em-btn inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-cyanx-300 ring-1 ring-ink-600"
        >
          <Icon name="download" /> Ver e exportar gravação
        </Link>
      </div>
    </Card>
  );
}

function Devices() {
  const adverts = useScan((s) => s.adverts);
  const bonded = useScan((s) => s.bonded);
  const usb = useScan((s) => s.usb);
  const running = useScan((s) => s.running);
  const ex = useExplorer();
  const [all, setAll] = useState(false);
  if (!adverts.length && !bonded.length && !usb) return null;
  const sorted = [...adverts].sort((a, b) => advertScore(b) - advertScore(a) || (b.rssi ?? -999) - (a.rssi ?? -999));
  const shown = all ? sorted : sorted.slice(0, 8);
  return (
    <Card title="O que foi encontrado">
      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <Icon name="bluetooth" /> Bluetooth LE ({adverts.length})
      </h3>
      <ul className="divide-y divide-ink-800">
        {shown.map((a) => {
          const clues = advertClues(a);
          return (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-100">
                  {a.name ?? <span className="text-slate-500">sem nome</span>}
                </div>
                <div className="font-mono text-[10px] text-slate-500">
                  {a.id} · {a.rssi ?? '?'} dBm
                </div>
                {clues.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {clues.map((c) => (
                      <span key={c.text} className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-cyanx-200">
                        {c.text}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Button
                disabled={running || ex.status === 'conectando' || ex.status === 'explorando'}
                onClick={() => void monitorDevice(a.id, a.name ?? a.id)}
              >
                Explorar
              </Button>
            </li>
          );
        })}
      </ul>
      {sorted.length > 8 && (
        <button className="mt-1 py-2 text-xs text-cyanx-300" onClick={() => setAll(!all)}>
          {all ? 'Mostrar menos' : `Mostrar todos (${sorted.length})`}
        </button>
      )}

      {bonded.length > 0 && (
        <>
          <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Pareados no celular ({bonded.length})
          </h3>
          <ul className="space-y-0.5 text-sm text-slate-300">
            {bonded.map((b) => (
              <li key={b.id} className="flex justify-between gap-2">
                <span className="truncate">{b.name ?? 'sem nome'}</span>
                <span className="font-mono text-[10px] text-slate-500">{b.id}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {usb && (
        <>
          <h3 className="mb-1 mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Icon name="usb" /> USB ({usb.devices.length})
          </h3>
          {usb.devices.length ? (
            <ul className="space-y-1 text-xs text-slate-300">
              {usb.devices.map((d) => (
                <li key={d.deviceId}>{describeUsb(d)}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">Nenhum dispositivo de dados conectado.</p>
          )}
        </>
      )}
    </Card>
  );
}

export default function ScannerPage() {
  const running = useScan((s) => s.running);
  const finished = useScan((s) => s.finishedAt);
  const ex = useExplorer();
  const capturing = useDiag((s) => s.capturing);
  const native = isNative();
  const live = ex.status !== 'idle';

  return (
    <div className="space-y-3">
      <PageHeader
        title="Scanner automático"
        subtitle="Identifica por onde a moto (ou um gateway) pode enviar dados e monitora o que for encontrado. Somente leitura."
      />
      {!running && <ScanHero />}

      {!running && !finished && (
        <Card title="Antes de escanear">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
            <li>Ligue a moto (painel aceso) e fique perto dela.</li>
            <li>Ative o Bluetooth e aceite a permissão “Dispositivos próximos”.</li>
            <li>Feche o app oficial da Voltz, se estiver aberto — muitos dispositivos aceitam só uma conexão.</li>
            <li>USB: só funciona com um gateway ligado por cabo OTG. A porta USB da moto apenas carrega.</li>
          </ol>
          <p className="mt-2 text-xs text-slate-500">
            Duração: cerca de {SCAN_MS / 1000} s de busca + {EXPLORE_MS / 1000} s por dispositivo promissor.
          </p>
          {!native && (
            <div className="mt-3 rounded border border-amber-400/40 bg-amber-500/10 p-2 text-xs text-amber-200">
              No navegador a busca automática não é permitida. Use o app Android, ou escolha um dispositivo manualmente:
              <Button
                className="mt-2 w-full"
                disabled={!bleSupported()}
                onClick={() => {
                  if (!capturing) startCapture(true);
                  void bleExplorer.explore();
                }}
              >
                Escolher dispositivo Bluetooth
              </Button>
            </div>
          )}
        </Card>
      )}

      {running && <Progress />}
      <Findings />
      {live && <Explorer />}
      <Devices />
    </div>
  );
}
