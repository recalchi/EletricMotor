import { Component, type ReactNode } from 'react';
import { errorReport, reportError } from './diagnostics';

interface Props {
  children: ReactNode;
  /** Muda ao trocar de tela para limpar o erro anterior. */
  resetKey?: string;
  area: string;
}
interface State {
  error: Error | null;
  copied: boolean;
}

/**
 * Isola falhas de uma tela: o restante do app (menu, adaptadores, captura) continua funcionando.
 * O erro é registrado no diagnóstico e pode ser copiado como relatório.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    reportError(`tela:${this.props.area}`, error, {
      componentStack: info.componentStack?.split('\n').slice(0, 6).join('\n'),
    });
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null, copied: false });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel mx-auto mt-6 max-w-xl p-5 text-sm" role="alert">
        <h2 className="mb-1 text-base font-semibold text-red-300">Esta tela encontrou um erro</h2>
        <p className="mb-3 text-slate-400">
          O restante do aplicativo continua funcionando e a recepção de dados não foi interrompida. O erro foi
          registrado em
          <b> Captura e diagnóstico</b>.
        </p>
        <pre className="mb-3 max-h-40 overflow-auto rounded bg-ink-950 p-2 text-xs text-red-200">
          {this.state.error.message}
        </pre>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md bg-cyanx-500 px-3 py-1.5 font-semibold text-ink-950"
            onClick={() => this.setState({ error: null })}
          >
            Tentar novamente
          </button>
          <button
            className="rounded-md bg-ink-700 px-3 py-1.5 text-slate-100 ring-1 ring-ink-600"
            onClick={() => {
              void navigator.clipboard?.writeText(errorReport({ tela: this.props.area }));
              this.setState({ copied: true });
            }}
          >
            {this.state.copied ? 'Relatório copiado' : 'Copiar relatório do erro'}
          </button>
        </div>
      </div>
    );
  }
}
