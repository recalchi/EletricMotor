import type { BenchState } from '../../integrations/bench';
import { cx } from '../../shared/ui';

/**
 * Painel ao vivo do teste com jumpers (jumper macho-fêmea): mostra o valor de cada pino do ESP32 agora, o que fazer
 * em seguida e quando passou. "34", "27", "13" são os NOMES IMPRESSOS NOS PINOS DA PLACA — a protoboard é só emenda.
 */
export function JumperPanel({ bench, live }: { bench: BenchState; live: boolean }) {
  const v34 = bench.ch.v34;
  const d27 = bench.ch.d27;
  const tq = bench.ch.tq13;
  const dinOk = !!d27 && d27.min === 0 && d27.max === 1;
  const touchOk = !!tq && tq.min <= tq.max * 0.6;

  const tiles = [
    {
      pin: '34',
      title: 'Tensão no pino 34',
      value: v34 ? `${v34.last.toFixed(2)} V` : '—',
      bar: v34 ? Math.min(1, v34.last / 3.3) : 0,
      ok: bench.adcLowAfterHigh,
      todo: !bench.adcHigh
        ? 'Fêmea no pino 34 e outra no pino 3V3; as duas pontas macho na MESMA coluna da protoboard. Deve subir para ~3,1 V.'
        : !bench.adcLowAfterHigh
          ? 'Viu o 3V3 ✓. Agora tire a fêmea do 3V3 e encaixe no pino GND (macho continua na coluna). Deve cair para ~0 V.'
          : 'Passou: subiu no 3V3 e caiu no GND.',
    },
    {
      pin: '27',
      title: 'Entrada digital no pino 27',
      value: d27 ? (d27.last ? '1 (solto)' : '0 (no GND)') : '—',
      bar: d27 ? d27.last : 0,
      ok: dinOk,
      todo: dinOk
        ? 'Passou: leu 1 solto e 0 ligado ao GND.'
        : 'Fêmea no pino 27 e outra no GND; machos na mesma coluna por ~4 s. Deve ir de 1 para 0.',
    },
    {
      pin: '13',
      title: 'Toque no pino 13',
      value: tq ? String(tq.last) : '—',
      bar: tq && tq.max ? tq.last / tq.max : 0,
      ok: touchOk,
      todo: touchOk
        ? 'Passou: o valor caiu com o toque.'
        : `Um jumper só: fêmea no pino 13, ponta macho solta. Encoste o dedo no metal: deve cair abaixo de ${tq ? Math.round(tq.max * 0.6) : '~1000'}.`,
    },
  ];

  return (
    <div className="mb-3 rounded border border-ink-700 p-3" data-testid="jumper-panel">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-slate-200">Teste com jumpers — ao vivo</div>
        <span className={cx('text-[11px]', live ? 'text-emerald-300' : 'text-amber-300')}>
          {live ? '● recebendo da placa' : '○ sem dados — plugue o USB e toque em Conectar USB'}
        </span>
      </div>
      <p className="mb-2 text-[11px] text-slate-400">
        Os números (34, 27, 13, 3V3, GND) são os nomes impressos ao lado dos pinos do ESP32 — não da protoboard. A
        protoboard só emenda as duas pontas macho: mesma coluna de 5 furinhos = ligado. Pode mexer nos jumpers com a
        placa ligada no USB; só nunca use o pino 5V. Um teste por vez.
        {' '}
        <a href="/guia/testes-jumper.html" target="_blank" rel="noreferrer" className="text-cyanx-300 underline">
          Ver desenho passo a passo
        </a>
      </p>
      <div className="grid gap-2 md:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.pin} className={cx('rounded border p-2', t.ok ? 'border-emerald-500/50' : 'border-ink-600')}>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-400">{t.title}</span>
              <span className={cx('text-xs', t.ok ? 'text-emerald-300' : 'text-slate-500')}>
                {t.ok ? '✓ ok' : 'pendente'}
              </span>
            </div>
            <div className="font-mono text-2xl text-white">{t.value}</div>
            <div className="my-1 h-1.5 rounded bg-ink-700">
              <div className="h-1.5 rounded bg-cyanx-400" style={{ width: `${Math.round(t.bar * 100)}%` }} />
            </div>
            <div className="text-[11px] text-slate-300">{t.todo}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
