import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../shared/ui/icons';
import { cx } from '../shared/ui';
import { useSession } from './session';
import { useApp } from './store';
import { useConnectionStatus } from './telemetry';
import { ErrorBoundary } from './ErrorBoundary';
import { useDiag } from './diagnostics';

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
  { to: '/captura', label: 'Captura e diagnóstico', icon: 'history' },
  { to: '/configuracoes', label: 'Configurações', icon: 'gear' },
  { to: '/manual', label: 'Manual Técnico', icon: 'book' },
];

/** Atalhos da barra inferior no celular (o restante fica em "Mais"). */
const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Central', icon: 'home' },
  { to: '/explorador', label: '3D', icon: 'cube' },
  { to: '/diagnostico', label: 'Alertas', icon: 'alert' },
  { to: '/conectividade', label: 'Conectar', icon: 'plug' },
];

function pageTitle(pathname: string) {
  const hit = [...NAV]
    .sort((a, b) => b.to.length - a.to.length)
    .find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)));
  return hit?.label ?? 'EletricMotor';
}

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

function Count({ n, tone }: { n: number; tone: 'red' | 'amber' }) {
  if (!n) return null;
  return (
    <span
      className={cx(
        'rounded-full px-1.5 text-[10px] font-bold leading-4',
        tone === 'red' ? 'bg-red-500 text-white' : 'bg-amber-500 text-ink-950',
      )}
    >
      {n}
    </span>
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
  const validated = useApp((s) => s.devices.filter((d) => d.status === 'validado').length);
  const online = useDiag((s) => s.online);
  const capturing = useDiag((s) => s.capturing);
  const captureCount = useDiag((s) => s.captureCount);
  const errorCount = useDiag((s) => s.errors.filter((e) => e.level === 'erro' && Date.now() - e.at < 3600_000).length);
  const openAlerts = useApp((s) => s.alerts.filter((a) => !a.endedAt && !a.acknowledgedAt).length);
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const inTabs = TABS.some((t) => (t.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(t.to)));

  const connDot = (
    <span
      className={cx(
        'h-2 w-2 shrink-0 rounded-full',
        conn.tone === 'ok' ? 'bg-emerald-400' : conn.tone === 'sim' ? 'animate-pulse bg-amber-400' : 'bg-slate-500',
      )}
    />
  );

  return (
    <div className={cx('flex h-full print:block print:h-auto', reduced && 'reduce-motion')}>
      {/* Menu lateral (gaveta no celular) */}
      <aside
        className={cx(
          'pt-safe fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col border-r border-ink-700 bg-ink-950 p-3 transition-transform print:hidden lg:static lg:w-60 lg:translate-x-0 lg:bg-ink-950/95',
          open ? 'translate-x-0 shadow-2xl shadow-black' : '-translate-x-full',
        )}
        aria-label="Menu"
      >
        <div className="mb-4 flex items-center justify-between px-1 pt-1">
          <Logo />
          <button
            className="-mr-1 rounded-md p-2 text-slate-400 hover:text-white lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        {/* Situação resumida — no celular ela sai do cabeçalho e vem para cá */}
        <div className="mb-3 space-y-1 rounded-md border border-ink-700 bg-ink-900/60 p-2.5 text-xs lg:hidden">
          <div className="truncate text-slate-200">
            {vehicle.name} <span className="text-slate-500">· {vehicle.model}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            {connDot} {conn.label}
          </div>
          <div className="text-slate-500">
            Telemetria REAL:{' '}
            <span className={validated ? 'text-emerald-300' : 'text-slate-300'}>
              {validated ? `${validated} validado(s)` : 'nenhum dispositivo validado'}
            </span>
          </div>
        </div>

        <nav className="no-scrollbar -mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1" aria-label="Principal">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition lg:py-2',
                  isActive
                    ? 'bg-cyanx-500/10 text-cyanx-300 shadow-glow'
                    : 'text-slate-400 hover:bg-ink-800 hover:text-slate-200',
                )
              }
            >
              <Icon name={n.icon} className="h-[18px] w-[18px]" />
              <span className="flex-1">{n.label}</span>
              {n.to === '/captura' && <Count n={errorCount} tone="red" />}
              {n.to === '/diagnostico' && <Count n={openAlerts} tone="amber" />}
            </NavLink>
          ))}
        </nav>
        <div className="pb-safe mt-3 rounded-md border border-ink-700 p-2.5 text-xs text-slate-400">
          <div className="truncate text-slate-300">{session?.displayName}</div>
          <div className="mb-2 truncate">
            {session?.mode === 'demo' ? 'Modo demonstração (local)' : (session?.email ?? 'Firebase')}
          </div>
          <button onClick={logout} className="flex items-center gap-1.5 py-1 text-slate-400 hover:text-white">
            <Icon name="logout" /> Sair
          </button>
        </div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px] lg:hidden" onClick={() => setOpen(false)} />
      )}

      <div className="flex min-w-0 flex-1 flex-col print:block">
        {/* Cabeçalho do celular: título da tela + estado essencial */}
        <header className="pt-safe sticky top-0 z-30 border-b border-ink-700 bg-ink-950/90 backdrop-blur print:hidden lg:hidden">
          <div className="flex h-12 items-center gap-2 px-2">
            <button
              className="rounded-md p-2 text-slate-300 active:bg-ink-800"
              onClick={() => setOpen(true)}
              aria-label="Abrir menu"
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>
            <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">{pageTitle(loc.pathname)}</h1>
            {capturing && (
              <NavLink
                to="/captura"
                className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-1 text-[11px] font-semibold text-red-300 ring-1 ring-red-500/40"
                aria-label={`Gravando ${captureCount} registros`}
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> {captureCount}
              </NavLink>
            )}
            <span
              className={cx(
                'flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] ring-1',
                conn.tone === 'ok'
                  ? 'text-emerald-300 ring-emerald-500/40'
                  : conn.tone === 'sim'
                    ? 'font-semibold text-amber-300 ring-amber-400/40'
                    : 'text-slate-400 ring-ink-600',
              )}
              title={conn.label}
            >
              {connDot}
              {conn.tone === 'ok' ? 'Ao vivo' : conn.tone === 'sim' ? 'Simulação' : 'Offline'}
            </span>
          </div>
          {!online && (
            <div className="bg-red-500/15 px-3 py-1 text-center text-[11px] font-semibold text-red-300">
              Sem internet — dados locais e conexões USB/BLE continuam
            </div>
          )}
        </header>

        {/* Cabeçalho do computador */}
        <header className="hidden flex-wrap items-center gap-x-5 gap-y-1 border-b border-ink-700 bg-ink-950/70 px-4 py-2 text-xs backdrop-blur print:hidden lg:flex">
          <div>
            <span className="text-slate-500">Veículo </span>
            <span className="font-medium text-slate-200">{vehicle.name}</span>
            <span className="text-slate-500">
              {' '}
              · {vehicle.model} {vehicle.year ?? '(ano a confirmar)'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {connDot}
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
          {!online && (
            <span className="rounded bg-red-500/15 px-1.5 py-0.5 font-semibold text-red-300 ring-1 ring-red-500/40">
              SEM INTERNET — dados locais e conexões USB/BLE continuam
            </span>
          )}
          {capturing && (
            <NavLink
              to="/captura"
              className="flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 font-semibold text-red-300 ring-1 ring-red-500/40"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> GRAVANDO {captureCount}
            </NavLink>
          )}
          <div className="ml-auto text-slate-500">
            Telemetria REAL:{' '}
            <span className={validated ? 'text-emerald-300' : 'text-slate-300'}>
              {validated ? `${validated} dispositivo(s) validado(s)` : 'nenhum dispositivo validado'}
            </span>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto p-3 pb-24 sm:p-4 lg:pb-4 print:overflow-visible print:p-0">
          <ErrorBoundary resetKey={loc.pathname} area={loc.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Barra inferior (celular) */}
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-ink-700 bg-ink-950/95 backdrop-blur print:hidden lg:hidden"
        aria-label="Atalhos"
      >
        <div className="grid h-16 grid-cols-5">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) =>
                cx(
                  'relative flex flex-col items-center justify-center gap-1 text-[11px] transition active:bg-ink-800',
                  isActive ? 'text-cyanx-300' : 'text-slate-400',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute inset-x-5 top-0 h-0.5 rounded-b bg-cyanx-400 shadow-glow" />}
                  <span className="relative">
                    <Icon name={t.icon} className="h-[22px] w-[22px]" />
                    {t.to === '/diagnostico' && openAlerts > 0 && (
                      <span className="absolute -right-2.5 -top-1.5">
                        <Count n={openAlerts} tone="amber" />
                      </span>
                    )}
                  </span>
                  {t.label}
                </>
              )}
            </NavLink>
          ))}
          <button
            className={cx(
              'relative flex flex-col items-center justify-center gap-1 text-[11px] transition active:bg-ink-800',
              !inTabs || open ? 'text-cyanx-300' : 'text-slate-400',
            )}
            onClick={() => setOpen(true)}
            aria-label="Mais telas"
          >
            {!inTabs && <span className="absolute inset-x-5 top-0 h-0.5 rounded-b bg-cyanx-400 shadow-glow" />}
            <span className="relative">
              <Icon name="menu" className="h-[22px] w-[22px]" />
              {errorCount > 0 && <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-red-500" />}
            </span>
            Mais
          </button>
        </div>
      </nav>
    </div>
  );
}
