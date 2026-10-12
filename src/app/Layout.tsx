import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../shared/ui/icons';
import { cx } from '../shared/ui';
import { useSession } from './session';
import { useApp } from './store';
import { useConnectionStatus } from './telemetry';

export const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Central de Controle', icon: 'home' },
  { to: '/explorador', label: 'Explorador 3D', icon: 'cube' },
  { to: '/diagnostico', label: 'Diagnóstico', icon: 'alert' },
  { to: '/baterias', label: 'Baterias', icon: 'battery' },
  { to: '/motor', label: 'Motor e Controladora', icon: 'motor' },
  { to: '/sensores', label: 'Sensores', icon: 'sensor' },
  { to: '/telemetria', label: 'Telemetria', icon: 'chart' },
  { to: '/manutencao', label: 'Manutenção', icon: 'wrench' },
  { to: '/conectividade', label: 'Conectividade', icon: 'plug' },
  { to: '/laboratorio', label: 'Laboratório', icon: 'flask' },
  { to: '/relatorios', label: 'Relatórios', icon: 'report' },
  { to: '/configuracoes', label: 'Configurações', icon: 'gear' },
  { to: '/manual', label: 'Manual Técnico', icon: 'book' },
];

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="h-8 w-8">
        <path d="M3 6l13 22L29 6h-6l-7 12L9 6z" fill="none" stroke="#22d3ee" strokeWidth="2" />
      </svg>
      <div className="leading-tight">
        <div className="text-sm font-bold tracking-[0.2em] text-white">ELETRICMOTOR</div>
        <div className="text-[10px] tracking-[0.3em] text-cyanx-400">VOLTZ EVS</div>
      </div>
    </div>
  );
}

export function Layout() {
  const { session, logout } = useSession();
  const vehicle = useApp((s) => s.vehicle);
  const conn = useConnectionStatus();
  const lastSample = useApp((s) => {
    const all = [...Object.values(s.latest.REAL), ...Object.values(s.latest.SIMULADO)];
    return all.reduce((m, x) => Math.max(m, x.timestamp), 0);
  });
  const reduced = useApp((s) => s.reducedMotion);
  const openAlerts = useApp((s) => s.alerts.filter((a) => !a.endedAt && !a.acknowledgedAt).length);
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);

  return (
    <div className={cx('flex h-full print:block print:h-auto', reduced && 'reduce-motion')}>
      {/* Sidebar */}
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 w-60 print:hidden shrink-0 border-r border-ink-700 bg-ink-950/95 p-3 transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-5 flex items-center justify-between px-1 pt-1">
          <Logo />
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu">
            <Icon name="x" />
          </button>
        </div>
        <nav className="space-y-0.5" aria-label="Principal">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition',
                  isActive
                    ? 'bg-cyanx-500/10 text-cyanx-300 shadow-glow'
                    : 'text-slate-400 hover:bg-ink-800 hover:text-slate-200',
                )
              }
            >
              <Icon name={n.icon} className="h-[18px] w-[18px]" />
              <span className="flex-1">{n.label}</span>
              {n.to === '/diagnostico' && openAlerts > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-ink-950">
                  {openAlerts}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="absolute inset-x-3 bottom-3 rounded-md border border-ink-700 p-2 text-xs text-slate-400">
          <div className="truncate text-slate-300">{session?.displayName}</div>
          <div className="mb-2">{session?.mode === 'demo' ? 'Modo demonstração (local)' : 'Firebase'}</div>
          <button onClick={logout} className="flex items-center gap-1.5 text-slate-400 hover:text-white">
            <Icon name="logout" /> Sair
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col print:block">
        {/* Header */}
        <header className="print:hidden flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-ink-700 bg-ink-950/70 px-4 py-2 text-xs backdrop-blur">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <div>
            <span className="text-slate-500">Veículo </span>
            <span className="font-medium text-slate-200">{vehicle.name}</span>
            <span className="text-slate-500">
              {' '}
              · {vehicle.model} {vehicle.year ?? '(ano a confirmar)'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={cx(
                'h-2 w-2 rounded-full',
                conn.tone === 'ok'
                  ? 'bg-emerald-400'
                  : conn.tone === 'sim'
                    ? 'animate-pulse bg-amber-400'
                    : 'bg-slate-500',
              )}
            />
            <span className={conn.tone === 'sim' ? 'font-semibold text-amber-300' : 'text-slate-300'}>
              {conn.label}
            </span>
          </div>
          <div className="text-slate-500">
            Última atualização:{' '}
            <span className="text-slate-300">
              {lastSample ? new Date(lastSample).toLocaleTimeString('pt-BR') : '—'}
            </span>
          </div>
          <div className="ml-auto text-slate-500">
            Telemetria REAL: <span className="text-slate-300">nenhuma interface validada</span>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto p-4 print:overflow-visible print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
