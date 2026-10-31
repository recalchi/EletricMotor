import { useState } from 'react';
import { Button, Card } from '../../shared/ui';

/**
 * Som da moto: o painel TFT da EVS pareia com o celular por Bluetooth (música/chamadas). Pareado como uma caixa de som
 * comum, o Android manda para ela todo o áudio de mídia — o deste teste e o do Spotify. O app não fala com a moto:
 * só toca no áudio do celular, e o sistema decide a saída.
 */
export function MotoAudioCard() {
  const [msg, setMsg] = useState<string | null>(null);

  const testTone = async () => {
    try {
      const Ctx =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const t0 = ctx.currentTime + 0.05;
      [440, 660, 880].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.5);
        g.gain.exponentialRampToValueAtTime(0.5, t0 + i * 0.5 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.5 + 0.4);
        o.connect(g).connect(ctx.destination);
        o.start(t0 + i * 0.5);
        o.stop(t0 + i * 0.5 + 0.42);
      });
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance('Teste de som do aplicativo Eletric Motor. Um, dois, três.');
        u.lang = 'pt-BR';
        setTimeout(() => speechSynthesis.speak(u), 1700);
      }
      setTimeout(() => void ctx.close(), 6000);
      setMsg('Tocando 3 bipes e uma frase. Saiu pela caixa da moto?');
    } catch (e) {
      setMsg(`Não foi possível tocar: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <Card title="Som da moto (Bluetooth)">
      <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-slate-300">
        <li>Moto ligada. No painel, abra o menu de Bluetooth/conectar celular (se houver).</li>
        <li>No celular: Configurações → Bluetooth → parear com o nome da moto, como uma caixa de som comum.</li>
        <li>Toque em “Tocar som de teste”: os bipes e a frase devem sair pela moto.</li>
        <li>Funcionando, qualquer áudio do celular (Spotify, YouTube, GPS) sai pela moto; o volume é o do celular.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void testTone()}>
          Tocar som de teste
        </Button>
        <a
          href="spotify:"
          className="inline-flex items-center rounded-md px-3 py-1.5 text-sm text-cyanx-300 ring-1 ring-ink-600"
        >
          Abrir Spotify
        </a>
      </div>
      {msg && <p className="mt-2 text-sm text-slate-300">{msg}</p>}
      <p className="mt-2 text-[11px] text-slate-500">
        Se não sair som: confira se o celular mostra a moto como “conectada para áudio de mídia”. Ainda não validado na
        moto — anote o resultado nas notas da captura.
      </p>
    </Card>
  );
}
