import { useMemo, useState } from 'react';
import { useApp } from '../../app/store';
import { buildTree } from '../../domain/catalog';
import { COVERAGE_LABEL } from '../../domain/coverage';
import type { CoverageLevel, VehicleComponent } from '../../domain/types';
import { cx } from '../../shared/ui';
import { Icon } from '../../shared/ui/icons';

const COV_DOT: Record<CoverageLevel, string> = {
  medido: 'bg-emerald-400',
  estimado: 'bg-sky-400',
  inspecao_manual: 'bg-violet-400',
  nao_coberto: 'bg-slate-600',
};

export function ComponentTree({ className }: { className?: string }) {
  const tree = useMemo(buildTree, []);
  const selected = useApp((s) => s.selectedId);
  const select = useApp((s) => s.select);
  const hover = useApp((s) => s.hover);
  const [q, setQ] = useState('');
  const [cov, setCov] = useState<CoverageLevel | 'todos'>('todos');

  const match = (c: VehicleComponent) =>
    (cov === 'todos' || c.coverage === cov) &&
    (!q || `${c.name} ${c.id} ${c.description}`.toLowerCase().includes(q.toLowerCase()));

  const Row = ({
    c,
    depth,
    childrenOf,
  }: {
    c: VehicleComponent;
    depth: number;
    childrenOf: (id: string) => VehicleComponent[];
  }) => {
    const kids = childrenOf(c.id);
    const visible = match(c) || kids.some(match);
    if (!visible) return null;
    return (
      <>
        <button
          onClick={() => select(c.id)}
          onMouseEnter={() => hover(c.id)}
          onMouseLeave={() => hover(null)}
          className={cx(
            'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[13px] transition',
            selected === c.id ? 'bg-cyanx-500/15 text-cyanx-300' : 'text-slate-300 hover:bg-ink-800',
          )}
          style={{ paddingLeft: 8 + depth * 14 }}
          aria-current={selected === c.id}
        >
          <span
            className={cx('h-1.5 w-1.5 shrink-0 rounded-full', COV_DOT[c.coverage])}
            title={COVERAGE_LABEL[c.coverage]}
          />
          <span className="truncate">{c.name}</span>
          {!c.mesh3d && <span className="ml-auto text-[9px] text-slate-500">sem 3D</span>}
        </button>
        {kids.map((k) => (
          <Row key={k.id} c={k} depth={depth + 1} childrenOf={childrenOf} />
        ))}
      </>
    );
  };

  return (
    <div className={cx('flex min-h-0 flex-col', className)}>
      <div className="relative mb-2">
        <Icon name="search" className="absolute left-2 top-2 h-4 w-4 text-slate-500" />
        <input
          className="input pl-8"
          placeholder="Buscar peça…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar componente"
        />
      </div>
      <select
        className="input mb-2 text-xs"
        value={cov}
        onChange={(e) => setCov(e.target.value as CoverageLevel | 'todos')}
        aria-label="Filtrar por cobertura"
      >
        <option value="todos">Todas as coberturas</option>
        {Object.entries(COVERAGE_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <div className="min-h-0 flex-1 overflow-auto pr-1">
        {tree.map((g) => (
          <div key={g.group} className="mb-2">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {g.label}
            </div>
            {g.roots.map((c) => (
              <Row key={c.id} c={c} depth={0} childrenOf={g.children} />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 border-t border-ink-700 pt-2 text-[10px] text-slate-400">
        {(Object.keys(COV_DOT) as CoverageLevel[]).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className={cx('h-1.5 w-1.5 rounded-full', COV_DOT[k])} />
            {COVERAGE_LABEL[k]}
          </span>
        ))}
      </div>
    </div>
  );
}
