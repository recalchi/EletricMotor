import { useApp } from '../../app/store';
import { CATALOG_BY_ID } from '../../domain/catalog';

/** Vista lateral 2D clicável usada quando WebGL não está disponível. */
const SHAPES: { id: string; d: string }[] = [
  { id: 'wheel-rear', d: 'M70 210a60 60 0 1 0 120 0a60 60 0 1 0 -120 0' },
  { id: 'wheel-front', d: 'M350 210a60 60 0 1 0 120 0a60 60 0 1 0 -120 0' },
  { id: 'hub-motor', d: 'M105 210a25 25 0 1 0 50 0a25 25 0 1 0 -50 0' },
  { id: 'swingarm', d: 'M130 205 L240 180 L242 192 L132 215 Z' },
  { id: 'battery-a', d: 'M222 100 h48 v80 h-48 Z' },
  { id: 'battery-b', d: 'M274 100 h48 v80 h-48 Z' },
  { id: 'motor-controller', d: 'M220 186 h50 v14 h-50 Z' },
  { id: 'fairing-tank', d: 'M235 70 L340 60 L370 80 L330 92 L235 92 Z' },
  { id: 'seat', d: 'M120 70 L235 70 L235 82 L130 86 Z' },
  { id: 'fork-front', d: 'M380 50 L392 48 L416 205 L404 207 Z' },
  { id: 'headlight', d: 'M395 70 L425 78 L420 98 L395 95 Z' },
  { id: 'tft-dashboard', d: 'M372 38 L392 34 L394 48 L374 52 Z' },
  { id: 'frame', d: 'M240 92 L380 60 L384 72 L250 110 Z' },
];

export function Fallback2D() {
  const selected = useApp((s) => s.selectedId);
  const select = useApp((s) => s.select);
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center bg-ink-950 p-4">
      <p className="mb-2 text-xs text-amber-300">WebGL indisponível — exibindo vista 2D simplificada.</p>
      <svg viewBox="40 20 460 260" className="w-full max-w-2xl" role="img" aria-label="Vista lateral simplificada">
        {SHAPES.map((s) => (
          <path
            key={s.id}
            d={s.d}
            onClick={() => select(s.id)}
            className="cursor-pointer transition"
            fill={selected === s.id ? 'rgba(34,211,238,.35)' : 'rgba(30,58,95,.5)'}
            stroke={selected === s.id ? '#22d3ee' : '#38bdf8'}
            strokeWidth={1.2}
          >
            <title>{CATALOG_BY_ID[s.id]?.name}</title>
          </path>
        ))}
      </svg>
    </div>
  );
}
