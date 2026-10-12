import type { ReactNode } from 'react';
import { ORIGIN_DESCRIPTION, ORIGIN_LABEL, type DisplayValue } from '../../domain/origin';
import type { DataOrigin, EvidenceStatus } from '../../domain/types';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const ORIGIN_STYLE: Record<DataOrigin, string> = {
  REAL: 'bg-origin-real/15 text-origin-real ring-origin-real/40',
  ESTIMADO: 'bg-origin-est/15 text-origin-est ring-origin-est/40',
  SIMULADO: 'bg-origin-sim/15 text-origin-sim ring-origin-sim/40',
  INDISPONIVEL: 'bg-origin-na/15 text-slate-400 ring-origin-na/40',
};

export function OriginBadge({ origin, className }: { origin: DataOrigin; className?: string }) {
  return (
    <span
      title={ORIGIN_DESCRIPTION[origin]}
      className={cx(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ring-1',
        ORIGIN_STYLE[origin],
        className,
      )}
    >
      {ORIGIN_LABEL[origin]}
    </span>
  );
}

export function StaleBadge() {
  return (
    <span
      title="Última leitura passou do prazo de validade — não é status ao vivo"
      className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-red-300 ring-1 ring-red-500/40"
    >
      DESATUALIZADO
    </span>
  );
}

const EVIDENCE: Record<EvidenceStatus, [string, string]> = {
  documento: ['Documento', 'text-origin-real ring-origin-real/40'],
  inspecao: ['Inspeção', 'text-origin-real ring-origin-real/40'],
  hipotese: ['Hipótese', 'text-amber-300 ring-amber-400/40'],
  nao_verificado: ['Não verificado', 'text-slate-400 ring-slate-500/40'],
};
export function EvidenceBadge({ status }: { status: EvidenceStatus }) {
  const [label, cls] = EVIDENCE[status];
  return <span className={cx('rounded px-1.5 py-0.5 text-[10px] font-medium ring-1', cls)}>{label}</span>;
}

export function Card({
  title,
  right,
  children,
  className,
  bodyClass,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={cx('panel', className)}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-2 border-b border-ink-700/70 px-4 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-cyanx-300">{title}</h2>
          {right}
        </header>
      )}
      <div className={cx('p-4', bodyClass)}>{children}</div>
    </section>
  );
}

export function fmtValue(v: number | null, digits = 1) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

/** Valor com unidade, origem e frescor. Valores INDISPONÍVEIS mostram traço, nunca número. */
export function Reading({
  label,
  dv,
  digits = 1,
  big,
}: {
  label: string;
  dv: DisplayValue;
  digits?: number;
  big?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400">
        <span className="truncate">{label}</span>
      </div>
      <div className={cx('font-mono tabular-nums', big ? 'text-3xl' : 'text-lg', dv.value == null && 'text-slate-500')}>
        {fmtValue(dv.value, digits)}
        <span className="ml-1 text-xs text-slate-400">{dv.value == null ? '' : dv.unit}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-1">
        <OriginBadge origin={dv.origin} />
        {dv.stale && <StaleBadge />}
      </div>
    </div>
  );
}

export function EmptyTelemetry({ children }: { children?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-ink-600 bg-ink-900/60 p-3 text-sm text-slate-400">
      <div className="mb-1 flex items-center gap-2">
        <OriginBadge origin="INDISPONIVEL" />
        <span className="font-medium text-slate-300">Sem telemetria validada</span>
      </div>
      {children ?? 'Nenhuma interface ou sensor validado fornece este dado. Use registro manual ou o simulador.'}
    </div>
  );
}

export function Button({
  children,
  variant = 'default',
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' | 'danger' }) {
  const v = {
    default: 'bg-ink-700 hover:bg-ink-600 text-slate-100 ring-1 ring-ink-600',
    primary: 'bg-cyanx-500 hover:bg-cyanx-400 text-ink-950 font-semibold',
    ghost: 'hover:bg-ink-700 text-slate-300',
    danger: 'bg-red-600/80 hover:bg-red-500 text-white',
  }[variant];
  return (
    <button
      {...p}
      className={cx(
        'em-btn inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition disabled:opacity-40',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanx-400',
        v,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs uppercase tracking-wider text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export function Bar({ value, tone = 'cyan' }: { value: number | null; tone?: 'cyan' | 'green' | 'amber' | 'red' }) {
  const c = { cyan: 'bg-cyanx-400', green: 'bg-emerald-400', amber: 'bg-amber-400', red: 'bg-red-400' }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-ink-700">
      {value != null && (
        <div className={cx('h-full rounded', c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="hidden text-xl font-semibold tracking-wide text-white lg:block">{title}</h1>
        {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function SimulationBanner() {
  return (
    <div className="sim-stripes mb-3 rounded-md px-3 py-1.5 text-center text-xs font-bold tracking-[0.3em] text-ink-950">
      MODO SIMULAÇÃO — DADOS FICTÍCIOS DE DEMONSTRAÇÃO
    </div>
  );
}
