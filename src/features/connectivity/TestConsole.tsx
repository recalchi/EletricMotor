import { useState } from 'react';
import { useApp } from '../../app/store';
import { getComponent } from '../../domain/catalog';
import { Button, Card, cx } from '../../shared/ui';

/** Console de teste (passo 6 do manual): mostra mensagens brutas, mapeamento e erros sem gravar telemetria. */
export function TestConsole() {
  const entries = useApp((s) => s.testConsole);
  const clear = useApp((s) => s.clearTest);
  const [raw, setRaw] = useState(false);

  return (
    <Card
      title="Console de teste (somente leitura)"
      right={
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-slate-400">
            <input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} /> bruto
          </label>
          <Button variant="ghost" onClick={clear} disabled={!entries.length}>
            Limpar
          </Button>
        </div>
      }
    >
      <p className="mb-2 text-xs text-slate-400">
        Mensagens de dispositivos em teste ou com problemas. Nada aqui entra na telemetria nem nos alertas.
      </p>
      {entries.length ? (
        <ul className="max-h-80 space-y-1 overflow-auto font-mono text-xs" data-testid="test-console">
          {entries.map((e, i) => (
            <li
              key={i}
              className={cx(
                'rounded border px-2 py-1',
                e.error ? 'border-red-500/40 text-red-200' : 'border-ink-700 text-slate-300',
              )}
            >
              <div className="flex flex-wrap gap-2">
                <span className="text-slate-500">{new Date(e.at).toLocaleTimeString('pt-BR')}</span>
                <span className="text-slate-500">{e.transport}</span>
                {e.dev && <span className="text-cyanx-300">{e.dev}</span>}
                {e.error && <span>⚠ {e.error}</span>}
                {e.note && <span className="text-slate-400">{e.note}</span>}
                {!!e.lost && <span className="text-amber-300">{e.lost} perdida(s)</span>}
              </div>
              {e.samples?.map((s) => (
                <div key={s.sensorId} className={s.quality === 'invalida' ? 'text-red-300' : ''}>
                  {s.sensorId} → {getComponent(s.componentId)?.name} · {s.quantity} = {s.value} {s.unit}
                  {s.quality === 'invalida' && ' (fora da faixa física)'}
                </div>
              ))}
              {!!e.unmapped?.length && (
                <div className="text-amber-300">canais sem mapeamento: {e.unmapped.join(', ')}</div>
              )}
              {raw && <div className="break-all text-slate-500">{e.raw}</div>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Aguardando mensagens…</p>
      )}
    </Card>
  );
}
