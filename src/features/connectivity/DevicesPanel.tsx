import { useState } from 'react';
import { useSession } from '../../app/session';
import { useCollection } from '../../data/hooks';
import { generateToken, sha256Hex } from '../../data/deviceToken';
import { CATALOG, getComponent } from '../../domain/catalog';
import { SENSOR_CANDIDATES } from '../../domain/sensors';
import type { DeviceChannel, DeviceProfile, DeviceTransport, Quantity } from '../../domain/types';
import { VALIDATION_CHECKLIST } from '../../integrations/mapping';
import { Button, Card, Field, cx } from '../../shared/ui';
import { Icon } from '../../shared/ui/icons';

const TRANSPORTS: Record<DeviceTransport, string> = {
  serial: 'USB serial (EMGP)',
  'ble-nus': 'Bluetooth UART/NUS (EMGP)',
  'ble-ess': 'Bluetooth padrão ESS',
  https: 'Internet → função de ingestão',
};

const QUANTITIES: { q: Quantity; unit: string }[] = [
  { q: 'temperature', unit: '°C' },
  { q: 'humidity', unit: '%' },
  { q: 'pressure', unit: 'psi' },
  { q: 'vibration', unit: 'g' },
  { q: 'voltage', unit: 'V' },
  { q: 'current', unit: 'A' },
  { q: 'power', unit: 'W' },
  { q: 'energy', unit: 'kWh' },
  { q: 'speed', unit: 'km/h' },
  { q: 'soc', unit: '%' },
];

const STATUS_STYLE = {
  teste: 'bg-amber-500/15 text-amber-300 ring-amber-400/40',
  validado: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/40',
  desativado: 'bg-slate-500/15 text-slate-400 ring-slate-500/40',
};

const blankChannel = (): DeviceChannel => ({
  channel: 't1',
  componentId: 'hub-motor',
  quantity: 'temperature',
  unit: '°C',
  scale: 1,
  offset: 0,
});

const blankDevice = (): DeviceProfile => ({
  id: '',
  name: '',
  transport: 'serial',
  channels: [blankChannel()],
  status: 'teste',
  createdAt: Date.now(),
  sampleValidityMs: 30_000,
});

/** Modelos prontos para os sensores propostos mais simples. */
const TEMPLATES: { label: string; device: Partial<DeviceProfile> }[] = [
  {
    label: 'ESP32 + temperatura do motor hub',
    device: {
      transport: 'serial',
      sensorCandidateId: 'temp-hub-surface',
      channels: [{ channel: 't1', componentId: 'hub-motor', quantity: 'temperature', unit: '°C', scale: 1, offset: 0 }],
    },
  },
  {
    label: 'Sensor ESS no compartimento das baterias',
    device: {
      transport: 'ble-ess',
      sensorCandidateId: 'bay-humidity',
      channels: [
        { channel: 't', componentId: 'battery-bay', quantity: 'temperature', unit: '°C', scale: 1, offset: 0 },
        { channel: 'h', componentId: 'battery-bay', quantity: 'humidity', unit: '%', scale: 1, offset: 0 },
      ],
    },
  },
  {
    label: 'Medidor de energia na tomada (carga)',
    device: {
      transport: 'https',
      sensorCandidateId: 'ext-energy-meter',
      channels: [
        { channel: 'p', componentId: 'charger', quantity: 'power', unit: 'W', scale: 1, offset: 0 },
        { channel: 'e', componentId: 'charger', quantity: 'energy', unit: 'kWh', scale: 1, offset: 0 },
      ],
    },
  },
];

function ValidationDialog({
  device,
  onClose,
  onConfirm,
}: {
  device: DeviceProfile;
  onClose: () => void;
  onConfirm: (notes: string) => void;
}) {
  const [checks, setChecks] = useState<boolean[]>(VALIDATION_CHECKLIST.map(() => false));
  const [notes, setNotes] = useState('');
  const all = checks.every(Boolean);
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="panel w-full max-w-lg p-5">
        <h3 className="mb-1 text-lg font-semibold text-white">Validar “{device.name}”</h3>
        <p className="mb-3 text-xs text-slate-400">
          Após validado, as leituras deste dispositivo passam a ser exibidas como{' '}
          <b className="text-emerald-300">REAL</b>. Confirme cada item:
        </p>
        <div className="space-y-2">
          {VALIDATION_CHECKLIST.map((c, i) => (
            <label key={c} className="flex items-start gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                className="mt-1"
                checked={checks[i]}
                onChange={(e) => setChecks(checks.map((x, j) => (j === i ? e.target.checked : x)))}
              />
              {c}
            </label>
          ))}
        </div>
        <Field label="Notas de validação (referência usada, desvio observado…)">
          <textarea className="input mt-1 h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!all || !notes.trim()} onClick={() => onConfirm(notes.trim())}>
            Marcar como validado
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DevicesPanel() {
  const { session, repo } = useSession();
  const devices = useCollection<DeviceProfile>('devices');
  const [draft, setDraft] = useState<DeviceProfile | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [validating, setValidating] = useState<DeviceProfile | null>(null);
  const [token, setToken] = useState<{ device: string; token: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const save = async (d: DeviceProfile) => {
    setErr(null);
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(d.id))
      return setErr(
        'ID inválido: use 3–40 caracteres (letras, números, - e _). Deve ser igual ao campo "dev" do firmware.',
      );
    if (isNew && devices.items.some((x) => x.id === d.id)) return setErr('Já existe um dispositivo com esse ID.');
    const names = d.channels.map((c) => c.channel);
    if (new Set(names).size !== names.length) return setErr('Nomes de canal repetidos.');
    // Alterar canais/calibração de um dispositivo validado exige nova validação
    const prev = devices.items.find((x) => x.id === d.id);
    const changed = prev && JSON.stringify(prev.channels) !== JSON.stringify(d.channels);
    const next: DeviceProfile =
      changed && prev?.status === 'validado' ? { ...d, status: 'teste', validatedAt: undefined } : d;
    await devices.add(next);
    setDraft(null);
  };

  const issueToken = async (d: DeviceProfile) => {
    if (!repo) return;
    const t = generateToken();
    const hash = await sha256Hex(t);
    await devices.add({ ...d, tokenHash: hash });
    await repo.setDeviceIndex(d.id, hash);
    setToken({ device: d.id, token: t });
  };

  const remove = async (d: DeviceProfile) => {
    if (!confirm(`Excluir o dispositivo ${d.name}? As leituras dele deixarão de ser aceitas.`)) return;
    await repo?.setDeviceIndex(d.id, null);
    await devices.remove(d.id);
  };

  const edit = (d: DeviceProfile, nw = false) => {
    setErr(null);
    setIsNew(nw);
    setDraft(structuredClone(d));
  };

  return (
    <Card
      title="Dispositivos de aquisição"
      right={<Button onClick={() => edit(blankDevice(), true)}>+ Novo dispositivo</Button>}
    >
      <p className="mb-3 text-xs text-slate-400">
        Sensores/gateways externos do proprietário. Cada canal da mensagem EMGP é mapeado a um componente da moto.
        Dispositivos em <b className="text-amber-300">teste</b> aparecem só no console; após a{' '}
        <b className="text-emerald-300">validação</b>, viram dados REAIS.
      </p>

      {devices.items.length ? (
        <div className="space-y-2">
          {devices.items.map((d) => (
            <div key={d.id} className="rounded-md border border-ink-700 p-3 text-sm" data-testid={`device-${d.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-100">{d.name}</span>
                <span className="font-mono text-xs text-slate-500">{d.id}</span>
                <span
                  className={cx(
                    'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1',
                    STATUS_STYLE[d.status],
                  )}
                >
                  {d.status}
                </span>
                <span className="text-xs text-slate-400">{TRANSPORTS[d.transport]}</span>
                <div className="ml-auto flex flex-wrap gap-1.5">
                  {d.status === 'teste' && (
                    <Button variant="primary" onClick={() => setValidating(d)}>
                      Validar
                    </Button>
                  )}
                  {d.status === 'validado' && (
                    <Button onClick={() => devices.add({ ...d, status: 'teste', validatedAt: undefined })}>
                      Voltar a teste
                    </Button>
                  )}
                  {d.transport === 'https' && session?.mode === 'firebase' && (
                    <Button onClick={() => issueToken(d)}>{d.tokenHash ? 'Gerar novo token' : 'Gerar token'}</Button>
                  )}
                  <Button variant="ghost" onClick={() => edit(d)}>
                    Editar
                  </Button>
                  <button
                    onClick={() => remove(d)}
                    aria-label="Excluir dispositivo"
                    className="px-1 text-slate-500 hover:text-red-300"
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
              <ul className="mt-2 grid gap-1 text-xs text-slate-400 md:grid-cols-2">
                {d.channels.map((c) => (
                  <li key={c.channel}>
                    <span className="font-mono text-cyanx-300">{c.channel}</span> → {getComponent(c.componentId)?.name}{' '}
                    · {c.quantity} ({c.unit})
                    {(c.scale !== 1 || c.offset !== 0) && (
                      <span className="text-slate-500">
                        {' '}
                        · ×{c.scale} {c.offset >= 0 ? '+' : ''}
                        {c.offset}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {d.status === 'validado' && d.validatedAt && (
                <p className="mt-1 text-[11px] text-emerald-300/80">
                  Validado em {new Date(d.validatedAt).toLocaleString('pt-BR')} — {d.validationNotes}
                </p>
              )}
              {d.transport === 'https' && session?.mode !== 'firebase' && (
                <p className="mt-1 text-[11px] text-amber-300">Ingestão pela internet requer login Firebase.</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">Nenhum dispositivo cadastrado.</p>
      )}
      {devices.error && <p className="mt-2 text-xs text-red-300">{devices.error}</p>}

      {token && (
        <div className="mt-3 rounded-md border border-cyanx-400/50 bg-cyanx-500/10 p-3 text-xs" role="alert">
          <div className="mb-1 font-semibold text-cyanx-200">
            Token do dispositivo {token.device} — copie agora, ele não será mostrado de novo
          </div>
          <code className="block break-all rounded bg-ink-950 p-2 font-mono text-slate-100">{token.token}</code>
          <div className="mt-2 flex gap-2">
            <Button onClick={() => navigator.clipboard?.writeText(token.token)}>Copiar</Button>
            <Button variant="ghost" onClick={() => setToken(null)}>
              Fechar
            </Button>
          </div>
          <p className="mt-2 text-slate-400">
            Guarde-o no firmware (arquivo de segredos fora do controle de versão). Gerar um novo token invalida o
            anterior.
          </p>
        </div>
      )}

      {draft && (
        <div className="mt-4 rounded-md border border-cyanx-400/40 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-white">{isNew ? 'Novo dispositivo' : `Editar ${draft.name}`}</h4>
            {isNew && (
              <select
                className="input ml-auto w-auto text-xs"
                value=""
                onChange={(e) => {
                  const t = TEMPLATES[Number(e.target.value)];
                  if (t) setDraft({ ...draft, ...structuredClone(t.device) });
                }}
                aria-label="Usar modelo"
              >
                <option value="">Usar modelo…</option>
                {TEMPLATES.map((t, i) => (
                  <option key={t.label} value={i}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <Field label="ID (campo “dev”)">
              <input
                className="input font-mono"
                disabled={!isNew}
                value={draft.id}
                onChange={(e) => setDraft({ ...draft, id: e.target.value.trim() })}
                placeholder="esp32-hub"
              />
            </Field>
            <Field label="Nome">
              <input
                className="input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Temperatura do hub"
              />
            </Field>
            <Field label="Transporte">
              <select
                className="input"
                value={draft.transport}
                onChange={(e) => setDraft({ ...draft, transport: e.target.value as DeviceTransport })}
              >
                {Object.entries(TRANSPORTS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Validade da leitura (s)">
              <input
                className="input"
                type="number"
                min={1}
                value={draft.sampleValidityMs / 1000}
                onChange={(e) => setDraft({ ...draft, sampleValidityMs: Math.max(1, Number(e.target.value)) * 1000 })}
              />
            </Field>
            <Field label="Sensor proposto">
              <select
                className="input"
                value={draft.sensorCandidateId ?? ''}
                onChange={(e) => setDraft({ ...draft, sensorCandidateId: e.target.value || undefined })}
              >
                <option value="">—</option>
                {SENSOR_CANDIDATES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Firmware / versão">
              <input
                className="input"
                value={draft.firmware ?? ''}
                onChange={(e) => setDraft({ ...draft, firmware: e.target.value })}
              />
            </Field>
          </div>
          {draft.transport === 'ble-ess' && (
            <p className="mt-2 text-[11px] text-slate-400">
              Sensores ESS usam canais <code>t</code> (temperatura) e <code>h</code> (umidade). O ID é exibido ao
              conectar (ex.: <code>ess-…</code>).
            </p>
          )}

          <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Canais</div>
          <div className="mt-1 space-y-1.5">
            {draft.channels.map((c, i) => {
              const set = (patch: Partial<DeviceChannel>) =>
                setDraft({ ...draft, channels: draft.channels.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
              return (
                <div
                  key={i}
                  className="grid grid-cols-2 items-end gap-1.5 md:grid-cols-[90px_1fr_130px_70px_80px_80px_auto]"
                >
                  <Field label="Canal">
                    <input
                      className="input font-mono"
                      value={c.channel}
                      onChange={(e) => set({ channel: e.target.value.trim() })}
                    />
                  </Field>
                  <Field label="Componente">
                    <select
                      className="input"
                      value={c.componentId}
                      onChange={(e) => set({ componentId: e.target.value })}
                    >
                      {CATALOG.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Grandeza">
                    <select
                      className="input"
                      value={c.quantity}
                      onChange={(e) => {
                        const q = QUANTITIES.find((x) => x.q === e.target.value)!;
                        set({ quantity: q.q, unit: q.unit });
                      }}
                    >
                      {QUANTITIES.map((q) => (
                        <option key={q.q} value={q.q}>
                          {q.q}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Unidade">
                    <input className="input" value={c.unit} onChange={(e) => set({ unit: e.target.value })} />
                  </Field>
                  <Field label="Escala">
                    <input
                      className="input"
                      type="number"
                      step="any"
                      value={c.scale}
                      onChange={(e) => set({ scale: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Offset">
                    <input
                      className="input"
                      type="number"
                      step="any"
                      value={c.offset}
                      onChange={(e) => set({ offset: Number(e.target.value) })}
                    />
                  </Field>
                  <button
                    type="button"
                    className="mb-2 text-slate-500 hover:text-red-300"
                    aria-label="Remover canal"
                    onClick={() => setDraft({ ...draft, channels: draft.channels.filter((_, j) => j !== i) })}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              onClick={() =>
                setDraft({
                  ...draft,
                  channels: [...draft.channels, { ...blankChannel(), channel: `c${draft.channels.length + 1}` }],
                })
              }
            >
              + Canal
            </Button>
            <span className="text-[11px] text-slate-500">
              valor = bruto × escala + offset. Alterar canais de um dispositivo validado o devolve para teste.
            </span>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancelar
              </Button>
              <Button variant="primary" disabled={!draft.name || !draft.channels.length} onClick={() => save(draft)}>
                Salvar dispositivo
              </Button>
            </div>
          </div>
          {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
        </div>
      )}

      {validating && (
        <ValidationDialog
          device={validating}
          onClose={() => setValidating(null)}
          onConfirm={async (notes) => {
            await devices.add({ ...validating, status: 'validado', validatedAt: Date.now(), validationNotes: notes });
            setValidating(null);
          }}
        />
      )}
    </Card>
  );
}
