import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HARDWARE, serial, useNow } from '../../app/telemetry';
import { FIRMWARE_CATALOG, compareVersions, latestRelease, type FirmwareRelease } from '../../integrations/firmware';
import {
  MODE_LABELS,
  etaSeconds,
  loadHistory,
  overallProgress,
  runFirmwareUpdate,
  saveToHistory,
  type FlashMode,
  type FlashRun,
  type FlashStage,
} from '../../integrations/flasher';
import { exportFile, saveBinaryFile, saveTextFile } from '../../platform/files';
import { isNative } from '../../platform/native';
import { live } from '../../app/liveLog';
import { flashSupported, requestFlashPort } from '../../platform/serial';
import { Bar, Button, Card, Field, PageHeader, cx } from '../../shared/ui';
import { Icon } from '../../shared/ui/icons';

const fmtDur = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, '0')}s`;
};

async function sha256(data: Uint8Array) {
  const h = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function loadFile(path: string) {
  const r = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!r.ok) throw new Error(`Arquivo ${path} indisponível (HTTP ${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

const STATE_ICON: Record<FlashStage['state'], string> = {
  pendente: '○',
  executando: '◌',
  ok: '✓',
  erro: '✕',
  pulado: '–',
};
const STATE_TONE: Record<FlashStage['state'], string> = {
  pendente: 'text-slate-500',
  executando: 'text-cyanx-300',
  ok: 'text-emerald-300',
  erro: 'text-red-300',
  pulado: 'text-slate-500',
};

/** Tela de carregamento da atualização: etapas, progresso, tempos e erro resumido. */
function ProgressOverlay({ run, onClose }: { run: FlashRun; onClose: () => void }) {
  const now = useNow(500);
  const [details, setDetails] = useState(false);
  const running = run.result === 'executando';
  const current = run.stages.find((s) => s.state === 'executando');
  const eta = current ? etaSeconds(current, now) : null;
  const pct = Math.round(overallProgress(run) * 100);
  const elapsed = (run.endedAt ?? now) - run.startedAt;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3">
      <div className="panel max-h-[95vh] w-full max-w-xl overflow-auto p-5" data-testid="flash-overlay">
        <h3 className="text-lg font-semibold text-white">
          {run.result === 'sucesso' ? 'Firmware atualizado' : run.result === 'falha' ? 'Atualização não concluída' : 'Atualizando firmware…'}
        </h3>
        <p className="text-xs text-slate-400">
          {run.firmware} {run.fromVersion ? `${run.fromVersion} → ` : ''}
          {run.toVersion} · {MODE_LABELS[run.mode]}
        </p>

        <div className="mt-4 flex items-end justify-between text-sm">
          <span className="text-slate-200">{current ? current.label : run.result === 'sucesso' ? 'Concluído' : 'Encerrado'}</span>
          <span className="font-mono text-2xl text-white">{pct}%</span>
        </div>
        <div className="mt-1">
          <Bar value={pct} tone={run.result === 'falha' ? 'red' : run.result === 'sucesso' ? 'green' : 'cyan'} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-slate-400">
          <span>Tempo decorrido: {fmtDur(elapsed)}</span>
          <span>
            {current?.total
              ? `${current.label.split(' ')[0]} ${Math.round((100 * (current.done ?? 0)) / current.total)}%`
              : ''}
            {eta != null ? ` · resta ~${fmtDur(eta * 1000)}` : ''}
          </span>
        </div>

        {running && (
          <p className="mt-3 rounded border border-amber-400/40 bg-amber-500/10 p-2 text-xs text-amber-200">
            Não desconecte o cabo nem feche o app. Se algo interromper a gravação, a placa continua recuperável: basta
            repetir a atualização.
          </p>
        )}

        <ol className="mt-4 space-y-1 text-sm">
          {run.stages.map((s) => (
            <li key={s.id} className="flex items-start gap-2">
              <span className={cx('w-4 text-center font-mono', STATE_TONE[s.state], s.state === 'executando' && 'animate-pulse')}>
                {STATE_ICON[s.state]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <span className={s.state === 'pendente' ? 'text-slate-500' : 'text-slate-200'}>{s.label}</span>
                  <span className="shrink-0 font-mono text-[11px] text-slate-500">
                    {s.startedAt ? fmtDur((s.endedAt ?? now) - s.startedAt) : ''}
                  </span>
                </div>
                {s.detail && <div className="text-[11px] text-slate-400">{s.detail}</div>}
              </div>
            </li>
          ))}
        </ol>

        {run.result === 'falha' && (
          <div className="mt-4 rounded border border-red-400/40 bg-red-500/10 p-3 text-sm" data-testid="flash-error">
            <div className="font-medium text-red-200">{run.error}</div>
            <button className="mt-1 text-xs text-red-300 underline" onClick={() => setDetails((d) => !d)}>
              {details ? 'Ocultar detalhes' : 'Ver detalhes técnicos'}
            </button>
            {details && (
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-slate-300">
                {run.errorDetail}
                {'\n\n'}
                {run.log.slice(-25).join('\n')}
              </pre>
            )}
          </div>
        )}

        {!running && (
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {run.backup?.uri && (
              <Button onClick={() => exportFile(run.backup!.uri!, run.backup!.name)}>
                <Icon name="download" /> Exportar backup
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => saveTextFile(`atualizacao-${run.firmware}-${run.toVersion}-${run.id}.log`, run.log.join('\n'))}
            >
              Salvar log
            </Button>
            <Button variant="primary" onClick={onClose}>
              Fechar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FirmwarePage() {
  useNow(2000);
  const [run, setRun] = useState<FlashRun | null>(null);
  const [history, setHistory] = useState<FlashRun[]>(() => loadHistory());
  const [mode, setMode] = useState<FlashMode>('app');
  const [backup, setBackup] = useState(true);
  // 115200: única velocidade validada em hardware para o backup nesta ponte CP2102 (30/10/2026)
  const baud = 115200;
  const [startErr, setStartErr] = useState<string | null>(null);

  const detected = HARDWARE.map((a) => ({ a, st: a.status() })).filter((x) => x.st.firmware);
  const current = detected[0]?.st.firmware;
  const releases = [...FIRMWARE_CATALOG].sort((x, y) => compareVersions(y.version, x.version));
  const [target, setTarget] = useState<FirmwareRelease>(() => latestRelease('esp32-gateway') ?? releases[0]);
  const serialBusy = ['conectado', 'conectando'].includes(serial.status().state);
  const running = run?.result === 'executando';

  useEffect(() => {
    if (!running) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [running]);

  const start = async () => {
    setStartErr(null);
    let port;
    try {
      port = await requestFlashPort();
    } catch (e) {
      setStartErr(e instanceof Error ? e.message : String(e));
      return;
    }
    const final = await runFirmwareUpdate(
      target,
      { mode, backup, baudrate: baud, fromVersion: current?.name === target.name ? current.version : undefined },
      { port, loadFile, sha256, saveBackup: saveBinaryFile, onChange: (r) => (liveFlash(r), setRun(r)) },
    );
    setHistory(saveToHistory(final));
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="Firmware do gateway"
        subtitle="Versões disponíveis, versão na placa e atualização com verificações, backup e confirmação no boot."
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Placa">
          {detected.length ? (
            detected.map(({ a, st }) => (
              <div key={a.id} className="text-sm" data-testid="fw-detected">
                <div className="text-slate-200">
                  {st.firmware!.name} <b className="text-white">v{st.firmware!.version}</b>
                  {st.firmware!.dev ? ` · ${st.firmware!.dev}` : ''}
                  <span className="text-xs text-slate-500"> via {a.name}</span>
                </div>
                <div
                  className={cx(
                    'mt-1 text-xs',
                    st.firmwareAdvice?.status === 'desatualizado' ? 'text-amber-300' : 'text-emerald-300',
                  )}
                >
                  {st.firmwareAdvice?.message}
                </div>
                {st.firmware!.sdk && (
                  <div className="text-[11px] text-slate-500">
                    SDK {st.firmware!.sdk} · chip rev {st.firmware!.chipRev}
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-400">
              Nenhum anúncio de versão recebido ainda. Conecte o gateway em{' '}
              <Link className="text-cyanx-300 underline" to="/conectividade">
                Conectividade
              </Link>{' '}
              (USB ou Bluetooth) — o firmware anuncia a versão no boot e a cada 60 s.
            </p>
          )}
        </Card>

        <Card title="Versões disponíveis">
          <ul className="space-y-2 text-sm">
            {releases.map((r) => (
              <li key={`${r.name}@${r.version}`} className="rounded border border-ink-700 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-200">
                    {r.name} <b className="text-white">v{r.version}</b>
                  </span>
                  <span className="text-[11px] text-slate-500">{r.date}</span>
                </div>
                <div className="text-xs text-slate-400">{r.notes}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                  {r.artifacts ? (
                    <span className="rounded bg-emerald-500/15 px-1.5 text-emerald-300">gravável pelo app</span>
                  ) : (
                    <span className="rounded bg-slate-500/15 px-1.5 text-slate-400">só pelo script do PC</span>
                  )}
                  {current?.name === r.name && current.version === r.version && (
                    <span className="rounded bg-cyanx-500/15 px-1.5 text-cyanx-300">na placa</span>
                  )}
                  <span className="font-mono text-slate-500">sha256 {r.sha256.slice(0, 12)}…</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Atualizar">
        {!flashSupported() ? (
          <p className="text-sm text-amber-300">
            Este navegador não acessa USB. Use Chrome ou Edge no computador, ou o APK no Android com cabo OTG.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Versão">
                <select
                  className="input"
                  value={`${target.name}@${target.version}`}
                  onChange={(e) => setTarget(releases.find((r) => `${r.name}@${r.version}` === e.target.value)!)}
                >
                  {releases
                    .filter((r) => r.artifacts)
                    .map((r) => (
                      <option key={r.version} value={`${r.name}@${r.version}`}>
                        {r.name} {r.version}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Modo" hint="Use completa na primeira gravação ou se a placa tiver outro firmware (ex.: de fábrica).">
                <select className="input" value={mode} onChange={(e) => setMode(e.target.value as FlashMode)}>
                  {(Object.keys(MODE_LABELS) as FlashMode[]).map((m) => (
                    <option key={m} value={m}>
                      {MODE_LABELS[m]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} />
              Fazer backup do firmware atual antes de gravar (recomendado)
            </label>
            <div className="rounded border border-ink-700 p-3 text-xs text-slate-400">
              <div className="mb-1 font-medium text-slate-300">O que acontece</div>
              Confere os arquivos por SHA-256 → coloca a placa em modo de gravação → confirma ESP32 com 4 MB e eFuses sem
              criptografia/Secure Boot → confere a tabela de partições → backup em blocos verificados pelo chip → grava com
              verificação de hash → reinicia e só conclui quando a placa anunciar a nova versão. Qualquer falha antes de
              gravar cancela sem escrever nada.
              {isNative() && (
                <div className="mt-2 text-amber-300">
                  No celular (USB OTG) a gravação ainda não foi testada em hardware — prefira o computador para a primeira
                  atualização.
                </div>
              )}
            </div>
            {serialBusy && (
              <p className="text-sm text-amber-300">
                O adaptador USB serial está conectado em Conectividade. Desconecte-o antes — a porta só pode ter um uso por vez.
              </p>
            )}
            {startErr && <p className="text-sm text-red-300">{startErr}</p>}
            <Button variant="primary" disabled={serialBusy || running} onClick={start} data-testid="fw-start">
              <Icon name="chip" /> Iniciar atualização
            </Button>
          </div>
        )}
      </Card>

      <Card title="Histórico de atualizações (este aparelho)">
        {history.length ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Data</th>
                <th>Versão</th>
                <th>Modo</th>
                <th>Duração</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.startedAt).toLocaleString('pt-BR')}</td>
                  <td>
                    {h.fromVersion ? `${h.fromVersion} → ` : ''}
                    {h.toVersion}
                  </td>
                  <td>{h.mode === 'app' ? 'app' : 'completa'}</td>
                  <td>{h.endedAt ? fmtDur(h.endedAt - h.startedAt) : '—'}</td>
                  <td className={h.result === 'sucesso' ? 'text-emerald-300' : 'text-red-300'}>
                    {h.result}
                    {h.error && <div className="text-[11px] text-slate-400">{h.error}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-400">Nenhuma atualização feita por este aparelho.</p>
        )}
      </Card>

      {run && <ProgressOverlay run={run} onClose={() => setRun(null)} />}
    </div>
  );
}

let flashSent = { id: '', lines: 0 };
/** Canal ao vivo (PC): repassa as linhas novas do log da gravação. */
function liveFlash(r: FlashRun) {
  if (flashSent.id !== r.id) flashSent = { id: r.id, lines: 0 };
  r.log.slice(flashSent.lines).forEach((l) => live('flash', l));
  flashSent.lines = r.log.length;
  if (r.result !== 'executando') live('flash', `resultado: ${r.result}${r.error ? ` — ${r.error}` : ''}`);
}
