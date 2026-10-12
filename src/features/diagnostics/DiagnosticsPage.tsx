import { useState } from 'react';
import { useApp } from '../../app/store';
import { useCollection } from '../../data/hooks';
import { CATALOG, getComponent } from '../../domain/catalog';
import type { Symptom } from '../../domain/types';
import { Button, Card, Field, OriginBadge, PageHeader, cx } from '../../shared/ui';
import { Icon } from '../../shared/ui/icons';

const SEV = { info: 'bg-sky-400', aviso: 'bg-amber-400', critico: 'bg-red-500' };

export default function DiagnosticsPage() {
  const alerts = useApp((s) => s.alerts);
  const rules = useApp((s) => s.rules);
  const ack = useApp((s) => s.ackAlert);
  const setRule = useApp((s) => s.setRule);
  const select = useApp((s) => s.select);
  const symptoms = useCollection<Symptom>('symptoms');
  const [f, setF] = useState({ componentId: 'battery-a', description: '' });
  const sorted = [...alerts].sort((a, b) => b.startedAt - a.startedAt);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Diagnóstico"
        subtitle="Alertas, sintomas e sugestões de inspeção. O sistema não emite diagnóstico definitivo sem evidência."
      />
      <Card title={`Alertas (${alerts.filter((a) => !a.endedAt).length} ativos)`}>
        {sorted.length ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Sev.</th>
                <th>Alerta</th>
                <th>Componente</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Origem</th>
                <th>Sugestão</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 50).map((a) => (
                <tr key={a.id} className={cx(a.endedAt != null && 'opacity-60')}>
                  <td>
                    <span className={cx('inline-block h-2.5 w-2.5 rounded-full', SEV[a.severity])} title={a.severity} />
                  </td>
                  <td>
                    <div className="text-slate-200">{a.title}</div>
                    <div className="text-xs text-slate-500">{a.message}</div>
                  </td>
                  <td>
                    <button className="text-cyanx-300 hover:underline" onClick={() => select(a.componentId)}>
                      {getComponent(a.componentId)?.name}
                    </button>
                  </td>
                  <td className="text-xs">{new Date(a.startedAt).toLocaleTimeString('pt-BR')}</td>
                  <td className="text-xs">{a.endedAt ? new Date(a.endedAt).toLocaleTimeString('pt-BR') : 'ativo'}</td>
                  <td>
                    <OriginBadge origin={a.origin} />
                  </td>
                  <td className="max-w-xs text-xs text-slate-400">{a.suggestion}</td>
                  <td>
                    {a.acknowledgedAt ? (
                      <span className="text-xs text-emerald-400">confirmado</span>
                    ) : (
                      <Button onClick={() => ack(a.id)}>Confirmar</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-400">
            Nenhum alerta. Sem fonte de telemetria validada, alertas só aparecem com o simulador (cenários de
            temperatura/carga baixa).
          </p>
        )}
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Regras de alerta">
          <p className="mb-2 text-xs text-amber-300">
            Limiares ILUSTRATIVOS — não representam limites seguros da Voltz EVS.
          </p>
          <table className="tbl">
            <thead>
              <tr>
                <th>Ativa</th>
                <th>Regra</th>
                <th>Condição</th>
                <th>Sev.</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={(e) => setRule(r.id, { enabled: e.target.checked })}
                      aria-label={`Ativar ${r.name}`}
                    />
                  </td>
                  <td>{r.name}</td>
                  <td className="whitespace-nowrap">
                    {r.quantity} {r.op}{' '}
                    <input
                      type="number"
                      className="input inline w-16 px-1 py-0.5"
                      value={r.threshold}
                      onChange={(e) => setRule(r.id, { threshold: Number(e.target.value) })}
                      aria-label={`Limiar ${r.name}`}
                    />
                  </td>
                  <td>{r.severity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Sintomas registrados">
          <form
            className="mb-3 grid grid-cols-[1fr_2fr_auto] items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!f.description.trim()) return;
              symptoms.add({
                date: new Date().toISOString().slice(0, 10),
                componentId: f.componentId,
                description: f.description,
                status: 'aberto',
              });
              setF({ ...f, description: '' });
            }}
          >
            <Field label="Componente">
              <select
                className="input"
                value={f.componentId}
                onChange={(e) => setF({ ...f, componentId: e.target.value })}
              >
                {CATALOG.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Descrição">
              <input
                className="input"
                placeholder="Ex.: ruído ao frear, autonomia menor…"
                value={f.description}
                onChange={(e) => setF({ ...f, description: e.target.value })}
              />
            </Field>
            <Button variant="primary" type="submit">
              Registrar
            </Button>
          </form>
          <ul className="space-y-1.5 text-sm">
            {symptoms.items.map((s) => (
              <li key={s.id} className="flex items-start gap-2 rounded border border-ink-700 p-2">
                <div className="flex-1">
                  <div className="text-slate-200">{s.description}</div>
                  <div className="text-xs text-slate-500">
                    {s.date} · {getComponent(s.componentId)?.name}
                  </div>
                </div>
                <select
                  className="input w-32 text-xs"
                  value={s.status}
                  onChange={(e) => symptoms.add({ ...s, status: e.target.value as Symptom['status'] })}
                >
                  <option value="aberto">aberto</option>
                  <option value="investigando">investigando</option>
                  <option value="resolvido">resolvido</option>
                </select>
                <button
                  onClick={() => symptoms.remove(s.id)}
                  aria-label="Excluir"
                  className="text-slate-500 hover:text-red-300"
                >
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ul>
          {!symptoms.items.length && <p className="text-xs text-slate-500">Nenhum sintoma registrado.</p>}
          <p className="mt-3 text-[11px] text-slate-500">
            Sugestão geral: registre condições (clima, carga, trajeto) junto ao sintoma; procure assistência autorizada
            para qualquer suspeita em baterias, freios ou alta tensão.
          </p>
        </Card>
      </div>
    </div>
  );
}
