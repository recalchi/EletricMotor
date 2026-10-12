import { useState } from 'react';
import { useApp } from '../../app/store';
import { ADAPTERS, startSimulation, stopSimulation, useNow } from '../../app/telemetry';
import { parseSamplesCsv } from '../../integrations/csv';
import { Button, Card, PageHeader, cx } from '../../shared/ui';

const STATE_STYLE: Record<string, string> = {
  conectado: 'text-emerald-300',
  desconectado: 'text-slate-400',
  conectando: 'text-sky-300',
  erro: 'text-red-300',
  nao_implementado: 'text-amber-300',
};

export default function ConnectivityPage() {
  useNow(1000);
  const log = useApp((s) => s.adapterLog);
  const running = useApp((s) => s.simRunning);
  const pushLog = useApp((s) => s.pushLog);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Conectividade"
        subtitle="Firebase não se conecta diretamente à moto. Toda leitura passa por um adaptador somente-leitura com contrato único."
      />
      <Card title="Fluxo de dados">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {[
            ['Voltz EVS', 'interfaces a verificar', 'amber'],
            ['Interface segura / gateway', 'não implementado', 'amber'],
            ['Adaptador de protocolo', 'aguarda validação', 'amber'],
            ['Normalização + origem', 'implementado', 'ok'],
            ['Ingestão autenticada', 'pendente (Cloud Function)', 'amber'],
            ['Firestore / séries', 'registros manuais', 'ok'],
            ['App + gêmeo 3D', 'implementado', 'ok'],
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
        <p className="mt-2 text-[11px] text-slate-500">
          Simulador e registros manuais entram na etapa de normalização com origem identificada.
        </p>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Adaptadores">
          <div className="space-y-2">
            {ADAPTERS.map((a) => {
              const st = a.status();
              return (
                <div key={a.id} className="rounded-md border border-ink-700 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-slate-200">{a.name}</div>
                      <div className="text-xs text-slate-500">
                        {a.kind} · v{st.version}
                      </div>
                    </div>
                    <span className={cx('text-xs font-semibold uppercase', STATE_STYLE[st.state])}>
                      {st.state.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{a.description}</p>
                  {st.message && <p className="mt-1 text-xs text-slate-500">{st.message}</p>}
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                    <span>Amostras: {st.samplesReceived}</span>
                    <span>Última: {st.lastSampleAt ? new Date(st.lastSampleAt).toLocaleTimeString('pt-BR') : '—'}</span>
                    <div className="ml-auto flex gap-2">
                      {a.kind === 'simulator' ? (
                        <Button onClick={running ? stopSimulation : startSimulation}>
                          {running ? 'Desconectar' : 'Conectar'}
                        </Button>
                      ) : (
                        <Button onClick={() => a.connect()}>Testar comunicação</Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="Importação manual (CSV)">
          <p className="mb-2 text-xs text-slate-400">
            Colunas: timestamp_utc, componentId, quantity, value, unit (mesmo formato da exportação). Dados importados
            entram como ESTIMADO/qualidade "suspeita" — nunca como REAL.
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
