import { useState } from 'react';
import { useApp } from '../../app/store';
import { useCollection } from '../../data/hooks';
import { maintenanceDue } from '../../domain/alerts';
import { CATALOG, getComponent } from '../../domain/catalog';
import type { MaintenanceRecord, ManualInspection, Photo } from '../../domain/types';
import { Button, Card, Field, PageHeader, cx } from '../../shared/ui';
import { Icon } from '../../shared/ui/icons';
import { PhotoInput, PhotoStrip } from '../../shared/ui/photos';

const today = () => new Date().toISOString().slice(0, 10);

export default function MaintenancePage() {
  const vehicle = useApp((s) => s.vehicle);
  const recs = useCollection<MaintenanceRecord>('maintenance');
  const insp = useCollection<ManualInspection>('inspections');
  const [m, setM] = useState({
    date: today(),
    odometerKm: String(vehicle.odometerKm || ''),
    componentId: 'brake-front',
    kind: 'revisao' as MaintenanceRecord['kind'],
    description: '',
    parts: '',
    costBRL: '',
    workshop: '',
    photos: [] as Photo[],
  });
  const [i, setI] = useState({
    componentId: 'tire-front',
    condition: 'ok' as ManualInspection['condition'],
    notes: '',
    photos: [] as Photo[],
  });

  const withRules = CATALOG.filter((c) => c.maintenanceRule);
  const lastFor = (id: string) => {
    const all = [
      ...recs.items.filter((r) => r.componentId === id).map((r) => ({ date: r.date, odometerKm: r.odometerKm })),
      ...insp.items.filter((r) => r.componentId === id).map((r) => ({ date: r.date, odometerKm: 0 })),
    ];
    return all.sort((a, b) => b.date.localeCompare(a.date))[0];
  };
  const total = recs.items.reduce((s, r) => s + (r.costBRL || 0), 0);

  return (
    <div className="space-y-3">
      <PageHeader title="Manutenção" subtitle="Revisões, peças, custos, inspeções manuais e lembretes." />
      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="Lembretes (regras operacionais)" className="lg:col-span-1">
          <p className="mb-2 text-[11px] text-slate-500">
            Baseados em uso/data. Não são prova de falha física. Intervalos ilustrativos — use o manual do fabricante.
          </p>
          <ul className="space-y-1.5 text-sm">
            {withRules.map((c) => {
              const due = maintenanceDue(c.maintenanceRule!, lastFor(c.id), {
                date: new Date(),
                odometerKm: vehicle.odometerKm,
              });
              return (
                <li key={c.id} className="flex items-start gap-2">
                  <span
                    className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', due.due ? 'bg-amber-400' : 'bg-emerald-400')}
                  />
                  <div>
                    <div className="text-slate-200">{c.name}</div>
                    <div className="text-xs text-slate-400">{c.maintenanceRule!.task}</div>
                    <div className="text-[11px] text-slate-500">{due.reason}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Novo registro de serviço" className="lg:col-span-2">
          <form
            className="grid grid-cols-2 gap-2 md:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              recs.add({ ...m, odometerKm: Number(m.odometerKm) || 0, costBRL: Number(m.costBRL) || 0 });
              setM({ ...m, description: '', parts: '', costBRL: '', photos: [] });
            }}
          >
            <Field label="Data">
              <input
                className="input"
                type="date"
                required
                value={m.date}
                onChange={(e) => setM({ ...m, date: e.target.value })}
              />
            </Field>
            <Field label="Odômetro (km)">
              <input
                className="input"
                type="number"
                value={m.odometerKm}
                onChange={(e) => setM({ ...m, odometerKm: e.target.value })}
              />
            </Field>
            <Field label="Componente">
              <select
                className="input"
                value={m.componentId}
                onChange={(e) => setM({ ...m, componentId: e.target.value })}
              >
                {CATALOG.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tipo">
              <select
                className="input"
                value={m.kind}
                onChange={(e) => setM({ ...m, kind: e.target.value as MaintenanceRecord['kind'] })}
              >
                <option value="revisao">Revisão</option>
                <option value="reparo">Reparo</option>
                <option value="troca">Troca de peça</option>
                <option value="inspecao">Inspeção</option>
              </select>
            </Field>
            <div className="col-span-2">
              <Field label="Descrição">
                <input
                  className="input"
                  required
                  value={m.description}
                  onChange={(e) => setM({ ...m, description: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Peças">
              <input className="input" value={m.parts} onChange={(e) => setM({ ...m, parts: e.target.value })} />
            </Field>
            <Field label="Custo (R$)">
              <input
                className="input"
                type="number"
                step="0.01"
                value={m.costBRL}
                onChange={(e) => setM({ ...m, costBRL: e.target.value })}
              />
            </Field>
            <div className="col-span-2">
              <Field label="Oficina / responsável">
                <input
                  className="input"
                  value={m.workshop}
                  onChange={(e) => setM({ ...m, workshop: e.target.value })}
                />
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="Fotos (nota fiscal, peça, serviço)">
                <PhotoInput value={m.photos} onChange={(photos) => setM({ ...m, photos })} />
              </Field>
            </div>
            <div className="col-span-2 flex items-end">
              <Button variant="primary" type="submit">
                Salvar registro
              </Button>
            </div>
          </form>
          {recs.error && <p className="mt-2 text-xs text-red-300">{recs.error}</p>}
        </Card>
      </div>

      <Card title={`Histórico de serviços · total R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}>
        {recs.items.length ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Data</th>
                <th>km</th>
                <th>Componente</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Peças</th>
                <th className="text-right">Custo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...recs.items]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.date + 'T12:00').toLocaleDateString('pt-BR')}</td>
                    <td>{r.odometerKm.toLocaleString('pt-BR')}</td>
                    <td>{getComponent(r.componentId)?.name}</td>
                    <td>{r.kind}</td>
                    <td>
                      {r.description}
                      {r.workshop && <div className="text-xs text-slate-500">{r.workshop}</div>}
                      <PhotoStrip photos={r.photos} />
                    </td>
                    <td className="text-xs">{r.parts}</td>
                    <td className="text-right">R$ {r.costBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td>
                      <button
                        onClick={() => recs.remove(r.id)}
                        aria-label="Excluir"
                        className="text-slate-500 hover:text-red-300"
                      >
                        <Icon name="trash" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-400">Nenhum serviço registrado.</p>
        )}
      </Card>

      <Card title="Inspeções manuais">
        <form
          className="mb-3 grid grid-cols-2 items-end gap-2 md:grid-cols-[1fr_160px_2fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            insp.add({ ...i, date: today() });
            setI({ ...i, notes: '', photos: [] });
          }}
        >
          <Field label="Componente">
            <select
              className="input"
              value={i.componentId}
              onChange={(e) => setI({ ...i, componentId: e.target.value })}
            >
              {CATALOG.filter((c) => c.coverage === 'inspecao_manual').map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Condição">
            <select
              className="input"
              value={i.condition}
              onChange={(e) => setI({ ...i, condition: e.target.value as ManualInspection['condition'] })}
            >
              <option value="ok">OK</option>
              <option value="atencao">Atenção</option>
              <option value="substituir">Substituir</option>
            </select>
          </Field>
          <Field label="Observações">
            <input className="input" value={i.notes} onChange={(e) => setI({ ...i, notes: e.target.value })} />
          </Field>
          <Button variant="primary" type="submit">
            Registrar inspeção
          </Button>
          <div className="col-span-2 md:col-span-4">
            <PhotoInput value={i.photos} onChange={(photos) => setI({ ...i, photos })} />
          </div>
        </form>
        <ul className="grid gap-1.5 text-sm md:grid-cols-2">
          {[...insp.items]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((x) => (
              <li key={x.id} className="flex items-center gap-2 rounded border border-ink-700 p-2">
                <span
                  className={cx(
                    'h-2 w-2 rounded-full',
                    x.condition === 'ok' ? 'bg-emerald-400' : x.condition === 'atencao' ? 'bg-amber-400' : 'bg-red-500',
                  )}
                />
                <span className="flex-1">
                  {getComponent(x.componentId)?.name}
                  <span className="ml-2 text-xs text-slate-500">
                    {x.date} {x.notes && `· ${x.notes}`}
                  </span>
                  <PhotoStrip photos={x.photos} />
                </span>
                <button
                  onClick={() => insp.remove(x.id)}
                  aria-label="Excluir"
                  className="text-slate-500 hover:text-red-300"
                >
                  <Icon name="trash" />
                </button>
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}
