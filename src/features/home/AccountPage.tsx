import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { APP_VERSION } from '../../app/diagnostics';
import { useSession } from '../../app/session';
import { useApp } from '../../app/store';
import { useTheme, type ThemePref } from '../../app/theme';
import { useReading } from '../../app/telemetry';
import { cx, fmtValue } from '../../shared/ui';
import { Icon, type IconName } from '../../shared/ui/icons';

/** "Minha conta": cartão do veículo e lista de opções, no estilo dos apps de carro. */

function Row({
  icon,
  label,
  to,
  onClick,
  right,
}: {
  icon: IconName;
  label: string;
  to?: string;
  onClick?: () => void;
  right?: ReactNode;
}) {
  const body = (
    <>
      <Icon name={icon} className="h-[22px] w-[22px] shrink-0 text-slate-400" />
      <span className="flex-1 text-[15px] text-fg">{label}</span>
      {right ?? <Icon name="chevron" className="h-4 w-4 text-slate-500" />}
    </>
  );
  const cls = 'flex w-full items-center gap-4 px-1 py-4 text-left active:opacity-60';
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

function ThemeSwitch() {
  const pref = useTheme((s) => s.pref);
  const setPref = useTheme((s) => s.setPref);
  const opts: { id: ThemePref; label: string }[] = [
    { id: 'claro', label: 'Claro' },
    { id: 'escuro', label: 'Escuro' },
    { id: 'sistema', label: 'Sistema' },
  ];
  return (
    <div className="flex rounded-full bg-ink-800 p-0.5 text-xs" role="radiogroup" aria-label="Aparência">
      {opts.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={pref === o.id}
          onClick={() => setPref(o.id)}
          className={cx(
            'rounded-full px-3 py-1.5',
            pref === o.id ? 'bg-card font-medium text-fg shadow-soft' : 'text-slate-500',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function AccountPage() {
  const { session, logout } = useSession();
  const vehicle = useApp((s) => s.vehicle);
  const odo = useReading('tft-dashboard', 'odometer', 'km');
  const km = odo.value ?? (vehicle.odometerKm || null);

  return (
    <div className="mx-auto max-w-xl px-1 pb-6 pt-4">
      {/* Avatar + nome */}
      <div className="flex flex-col items-center">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-ink-700/70">
          <svg viewBox="0 0 32 32" className="h-9 w-9">
            <path d="M3 6l13 22L29 6h-6l-7 12L9 6z" fill="none" stroke="rgb(var(--cyanx-400))" strokeWidth="2.2" />
          </svg>
        </div>
        <div className="mt-2 text-base font-medium text-fg">{session?.displayName}</div>
        <div className="text-xs text-slate-500">
          {session?.mode === 'demo' ? 'Modo demonstração (dados só neste aparelho)' : session?.email}
        </div>
      </div>

      {/* Cartão do veículo */}
      <div className="relative mt-6 overflow-hidden rounded-2xl bg-gradient-to-br from-ink-700 to-ink-600 p-5 shadow-soft">
        <div className="relative z-10 max-w-[60%]">
          <div className="text-lg font-semibold uppercase tracking-wide text-fg">{vehicle.model}</div>
          <div className="mt-1 text-xs text-slate-400">
            {vehicle.name} · {vehicle.year ?? 'ano a confirmar'}
          </div>
          <div className="mt-3 text-xs text-slate-400">ODO</div>
          <div className="text-fg">
            <span className="text-xl font-medium tabular-nums">{km == null ? '—' : fmtValue(km, 0)}</span>
            <span className="ml-1 text-xs text-slate-400">km</span>
          </div>
          <Link
            to="/configuracoes"
            className="mt-3 inline-block rounded-lg border border-slate-400/60 px-3 py-1.5 text-xs text-slate-300 active:opacity-60"
          >
            Dados do veículo
          </Link>
        </div>
        {/* Silhueta da moto (desenho simples, não é foto do modelo) */}
        <svg
          viewBox="0 0 200 110"
          className="absolute -right-3 bottom-2 w-[52%] text-slate-300 opacity-90"
          aria-hidden="true"
        >
          <g fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="40" cy="78" r="24" />
            <circle cx="162" cy="78" r="24" />
            <path d="M40 78 L78 60 L118 60 L140 30 L152 30 M118 60 L162 78 M64 48 L108 46 L118 60 M140 30 L130 22" />
          </g>
          <circle cx="40" cy="78" r="9" fill="rgb(var(--cyanx-400))" />
        </svg>
      </div>

      {/* Opções */}
      <div className="mt-4 divide-y divide-ink-700 px-3">
        <Row icon="sun" label="Aparência" right={<ThemeSwitch />} />
        <Row icon="shield" label="Conta e segurança" to="/configuracoes" />
        <Row icon="chip" label="Firmware do gateway" to="/firmware" />
        <Row icon="history" label="Captura e diagnóstico" to="/captura" />
        <Row icon="book" label="Manual técnico" to="/manual" />
        <Row icon="gear" label="Configurações" to="/configuracoes" />
        <Row icon="info" label={`Sobre · versão ${APP_VERSION}`} to="/manual" />
        <Row icon="logout" label="Sair" onClick={logout} right={<span />} />
      </div>
    </div>
  );
}
