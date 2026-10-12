import { useEffect, useState } from 'react';
import { useSession } from '../../app/session';
import { useApp } from '../../app/store';
import { useVehicleSettings } from '../../app/vehicleData';
import type { VehicleProfile } from '../../domain/types';
import { Button, Card, Field, PageHeader } from '../../shared/ui';

export default function SettingsPage() {
  const { session, repo } = useSession();
  const vehicle = useApp((s) => s.vehicle);
  const setVehicle = useApp((s) => s.setVehicle);
  const reduced = useApp((s) => s.reducedMotion);
  const setReduced = useApp((s) => s.setReducedMotion);
  const { value: settings, save: saveSettings, loaded } = useVehicleSettings();
  const [v, setV] = useState<VehicleProfile>(vehicle);
  const [cons, setCons] = useState('');
  const [consSrc, setConsSrc] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => setV(vehicle), [vehicle]);
  useEffect(() => {
    if (loaded) {
      setCons(settings.consumptionWhKm?.toString() ?? '');
      setConsSrc(settings.consumptionSource);
    }
  }, [loaded, settings]);

  const flash = (m: string) => {
    setSaved(m);
    setTimeout(() => setSaved(null), 2500);
  };

  return (
    <div className="space-y-3">
      <PageHeader title="Configurações" subtitle="Conta, veículo, estimativas e apresentação." />
      {saved && (
        <div className="rounded border border-emerald-400/40 bg-emerald-500/10 p-2 text-sm text-emerald-200">
          {saved}
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Veículo">
          <form
            className="grid grid-cols-2 gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setVehicle(v);
              await repo?.setDoc('vehicle', v);
              flash('Veículo salvo.');
            }}
          >
            <Field label="Apelido">
              <input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            </Field>
            <Field label="Modelo">
              <input className="input" value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} />
            </Field>
            <Field label="Ano">
              <input
                className="input"
                type="number"
                value={v.year ?? ''}
                onChange={(e) => setV({ ...v, year: e.target.value ? Number(e.target.value) : null })}
              />
            </Field>
            <Field label="Variante / versão">
              <input className="input" value={v.variant} onChange={(e) => setV({ ...v, variant: e.target.value })} />
            </Field>
            <Field label="Baterias instaladas">
              <select
                className="input"
                value={v.batteryCount}
                onChange={(e) => setV({ ...v, batteryCount: Number(e.target.value) as 1 | 2 })}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </Field>
            <Field label="Odômetro (km, leitura do painel)">
              <input
                className="input"
                type="number"
                value={v.odometerKm}
                onChange={(e) => setV({ ...v, odometerKm: Number(e.target.value) })}
              />
            </Field>
            <label className="col-span-2 flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={v.vinVerified}
                onChange={(e) => setV({ ...v, vinVerified: e.target.checked })}
              />
              Chassi/modelo conferidos no documento do veículo
            </label>
            <div className="col-span-2">
              <Button variant="primary" type="submit">
                Salvar veículo
              </Button>
            </div>
          </form>
        </Card>

        <Card title="Estimativa de autonomia">
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              await saveSettings({ consumptionWhKm: cons ? Number(cons) : null, consumptionSource: consSrc });
              flash('Parâmetros de estimativa salvos.');
            }}
          >
            <Field
              label="Consumo médio de referência (Wh/km)"
              hint="Sem este valor a autonomia fica INDISPONÍVEL. Use seus registros (energia da rede ÷ km)."
            >
              <input
                className="input"
                type="number"
                step="0.1"
                value={cons}
                onChange={(e) => setCons(e.target.value)}
              />
            </Field>
            <Field label="Fonte do valor">
              <input
                className="input"
                placeholder="Ex.: média de 5 recargas medidas com medidor de tomada"
                value={consSrc}
                onChange={(e) => setConsSrc(e.target.value)}
              />
            </Field>
            <Button variant="primary" type="submit">
              Salvar
            </Button>
          </form>
        </Card>

        <Card title="Apresentação e acessibilidade">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
            Reduzir animações (vista explodida e câmera mudam instantaneamente)
          </label>
          <p className="mt-2 text-xs text-slate-500">
            Unidades: SI (V, A, °C, km, kWh). Armazenamento em UTC; exibição no fuso local.
          </p>
        </Card>

        <Card title="Conta">
          <dl className="grid grid-cols-2 gap-1 text-sm">
            <dt className="text-slate-400">Usuário</dt>
            <dd>{session?.displayName}</dd>
            <dt className="text-slate-400">Modo</dt>
            <dd>{session?.mode === 'demo' ? 'Demonstração (localStorage)' : 'Firebase (Firestore)'}</dd>
            <dt className="text-slate-400">E-mail</dt>
            <dd>{session?.email ?? '—'}</dd>
          </dl>
          <p className="mt-2 text-xs text-slate-500">
            Acesso aos dados restrito ao proprietário (regras do Firestore por uid).
          </p>
        </Card>
      </div>
    </div>
  );
}
