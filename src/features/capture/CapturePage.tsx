import { useEffect, useState } from 'react';
import {
  clearErrors,
  deleteSession,
  environmentInfo,
  errorReport,
  listSessions,
  readSession,
  startCapture,
  stopCapture,
  toJsonl,
  useDiag,
} from '../../app/diagnostics';
import { useApp } from '../../app/store';
import { bleExplorer, type ExplorerState } from '../../integrations/hardware/BleExplorer';
import { bleSupported } from '../../platform/ble';
import { saveTextFile } from '../../platform/files';
import { Button, Card, PageHeader, cx } from '../../shared/ui';
import { Icon } from '../../shared/ui/icons';

type Session = Awaited<ReturnType<typeof listSessions>>[number];

function Recorder() {
  const capturing = useDiag((s) => s.capturing);
  const count = useDiag((s) => s.captureCount);
  const startedAt = useDiag((s) => s.captureStartedAt);
  const raw = useDiag((s) => s.captureRaw);
  const devices = useApp((s) => s.devices);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () =>
    listSessions()
      .then(setSessions)
      .catch((e) => setErr(String(e)));
  useEffect(() => {
    void refresh();
  }, [capturing]);

  const exportSession = async (s: Session) => {
    setBusy(s.session);
    try {
      const recs = await readSession(s.session);
      const text = toJsonl(recs, {
        sessao: s.session,
        ambiente: environmentInfo(),
        dispositivos: devices,
        exportadoEm: new Date().toISOString(),
      });
      await saveTextFile(`captura-${s.session}.jsonl`, text, 'application/x-ndjson');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card
      title="Gravador de captura"
      right={
        capturing ? (
          <Button variant="danger" onClick={() => void stopCapture().then(refresh)} data-testid="capture-stop">
            <Icon name="pause" /> Parar ({count})
          </Button>
        ) : (
          <Button variant="primary" onClick={() => startCapture(raw)} data-testid="capture-start">
            <Icon name="play" /> Iniciar gravação
          </Button>
        )
      }
    >
      <p className="mb-2 text-xs text-slate-400">
        Registra <b>tudo</b> o que chega pelos adaptadores USB e Bluetooth e pelo explorador BLE: bytes brutos (hex),
        linhas, mensagens interpretadas, mensagens rejeitadas e o motivo, mapa de serviços BLE, conexões, quedas e
        erros. Os dados ficam só neste aparelho até você exportar. Use para investigar dispositivos desconhecidos e para
        enviar ao desenvolvimento.
      </p>
      <label className="mb-2 flex items-center gap-2 text-xs text-slate-300">
        <input
          type="checkbox"
          checked={raw}
          disabled={capturing}
          onChange={(e) => useDiag.setState({ captureRaw: e.target.checked })}
        />
        Incluir bytes brutos (hex) — maior volume, necessário para analisar protocolos desconhecidos
      </label>
      {capturing && startedAt && (
        <p className="mb-2 text-xs text-red-300">
          Gravando desde {new Date(startedAt).toLocaleTimeString('pt-BR')} — {count} registro(s).
        </p>
      )}
      {err && <p className="mb-2 text-xs text-red-300">{err}</p>}
      {sessions.length ? (
        <table className="tbl">
          <thead>
            <tr>
              <th>Sessão</th>
              <th>Registros</th>
              <th>Duração</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.session}>
                <td className="font-mono text-xs">{new Date(s.first).toLocaleString('pt-BR')}</td>
                <td>{s.count.toLocaleString('pt-BR')}</td>
                <td>{Math.max(1, Math.round((s.last - s.first) / 1000))} s</td>
                <td className="whitespace-nowrap text-right">
                  <Button disabled={busy === s.session} onClick={() => exportSession(s)}>
                    <Icon name="download" /> {busy === s.session ? 'Gerando…' : 'Exportar JSONL'}
                  </Button>
                  <button
                    className="ml-2 text-slate-500 hover:text-red-300"
                    aria-label="Excluir sessão"
                    onClick={() =>
                      confirm('Excluir esta sessão de captura?') && void deleteSession(s.session).then(refresh)
                    }
                  >
                    <Icon name="trash" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-slate-500">Nenhuma sessão gravada.</p>
      )}
    </Card>
  );
}

export function Explorer() {
  const [st, setSt] = useState<ExplorerState>(bleExplorer.state);
  const [extra, setExtra] = useState('');
  const capturing = useDiag((s) => s.capturing);
  useEffect(() => bleExplorer.onChange(setSt), []);
  const running = st.status === 'conectando' || st.status === 'explorando' || st.status === 'ativo';

  return (
    <Card
      title="Explorador Bluetooth (leitura completa)"
      right={
        running ? (
          <Button onClick={() => bleExplorer.stop()}>Encerrar</Button>
        ) : (
          <Button
            variant="primary"
            disabled={!bleSupported()}
            onClick={() => {
              if (!capturing) startCapture(true);
              void bleExplorer.explore(extra.split(/[\s,;]+/).filter(Boolean));
            }}
            data-testid="explorer-start"
          >
            Explorar dispositivo
          </Button>
        )
      }
    >
      <p className="mb-2 text-xs text-slate-400">
        Conecta a qualquer dispositivo BLE próximo, lista todos os serviços e características, lê as legíveis e assina
        as notificações. <b className="text-emerald-300">Nunca escreve</b> nada no dispositivo. Ao explorar, a gravação
        é iniciada automaticamente. Para investigar o Bluetooth do painel da moto, faça isso com a moto{' '}
        <b>desligada da tomada</b>, estacionada e com o painel ligado.
      </p>
      {!bleSupported() && (
        <p className="text-xs text-amber-300">Bluetooth indisponível aqui — use Chrome/Edge ou o APK.</p>
      )}
      <label className="mb-2 block text-xs text-slate-400">
        UUIDs de serviço adicionais (só no navegador; o APK descobre todos)
        <input
          className="input mt-1 font-mono text-xs"
          placeholder="ex.: 0000ffe0-0000-1000-8000-00805f9b34fb, fff0"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
        />
      </label>
      {st.message && (
        <p className={cx('mb-2 text-xs', st.status === 'erro' ? 'text-red-300' : 'text-slate-300')}>
          {st.device && <b className="text-cyanx-300">{st.device}: </b>}
          {st.message}
        </p>
      )}
      <div className="max-h-[520px] space-y-2 overflow-auto">
        {st.services.map((s) => (
          <div key={s.uuid} className="rounded border border-ink-700 p-2">
            <div className="text-xs">
              <span className="font-semibold text-slate-200">{s.name}</span>{' '}
              <span className="font-mono text-slate-500">{s.uuid}</span>
            </div>
            <ul className="mt-1 space-y-1">
              {s.chars.map((c) => (
                <li key={c.uuid} className="rounded bg-ink-850/60 px-2 py-1 font-mono text-[11px]">
                  <div className="flex flex-wrap gap-2">
                    <span className="text-slate-200">{c.name}</span>
                    <span className="text-slate-500">{c.uuid}</span>
                    <span className="text-cyanx-300">[{c.props.join(', ')}]</span>
                    {c.notifications > 0 && (
                      <span className="text-emerald-300">{c.notifications} notificação(ões)</span>
                    )}
                  </div>
                  {c.decoded && <div className="text-emerald-200">= {c.decoded}</div>}
                  {c.lastText && <div className="text-slate-300">texto: {c.lastText}</div>}
                  {c.lastHex && <div className="break-all text-slate-400">hex: {c.lastHex}</div>}
                  {c.error && <div className="text-amber-300">{c.error}</div>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Valores sem formato padrão conhecido aparecem apenas como hex/texto — o significado precisa ser confirmado por
        documentação ou análise controlada antes de virar telemetria.
      </p>
    </Card>
  );
}

function ErrorLog() {
  const errors = useDiag((s) => s.errors);
  const [copied, setCopied] = useState(false);
  return (
    <Card
      title={`Registro de erros do aplicativo (${errors.length})`}
      right={
        <div className="flex gap-2">
          <Button
            onClick={() =>
              void saveTextFile(
                `relatorio-erros-${new Date().toISOString().slice(0, 10)}.json`,
                errorReport(),
                'application/json',
              )
            }
            disabled={!errors.length}
          >
            <Icon name="download" /> Exportar
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(errorReport());
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
          <Button variant="ghost" onClick={clearErrors} disabled={!errors.length}>
            Limpar
          </Button>
        </div>
      }
    >
      {errors.length ? (
        <ul className="max-h-80 space-y-1 overflow-auto text-xs">
          {errors.map((e, i) => (
            <li
              key={i}
              className={cx(
                'rounded border px-2 py-1',
                e.level === 'erro' ? 'border-red-500/40' : 'border-amber-400/30',
              )}
            >
              <div className="flex flex-wrap gap-2">
                <span className="font-mono text-slate-500">{new Date(e.at).toLocaleString('pt-BR')}</span>
                <span className={e.level === 'erro' ? 'text-red-300' : 'text-amber-300'}>{e.level}</span>
                <span className="text-cyanx-300">{e.source}</span>
              </div>
              <div className="text-slate-200">{e.message}</div>
              {e.stack && (
                <details>
                  <summary className="cursor-pointer text-slate-500">detalhes</summary>
                  <pre className="whitespace-pre-wrap text-[10px] text-slate-500">{e.stack}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">Nenhum erro registrado.</p>
      )}
    </Card>
  );
}

function Environment() {
  const env = environmentInfo();
  return (
    <Card title="Ambiente">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {Object.entries(env).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{k}</dt>
            <dd className="break-all text-slate-300">{String(v)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export default function CapturePage() {
  return (
    <div className="space-y-3">
      <PageHeader
        title="Captura e diagnóstico"
        subtitle="Grava tudo o que é recebido, explora dispositivos Bluetooth em modo somente leitura e registra erros do aplicativo para melhorias."
      />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="min-w-0 space-y-3">
          <Recorder />
          <ErrorLog />
          <Environment />
        </div>
        <Explorer />
      </div>
    </div>
  );
}
