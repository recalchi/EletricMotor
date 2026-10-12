import { describe, expect, it } from 'vitest';
import { capture, clearErrors, errorReport, reportError, toHex, toJsonl, useDiag } from './diagnostics';

describe('diagnóstico', () => {
  it('toHex formata bytes e trunca', () => {
    expect(toHex(new Uint8Array([0, 10, 255]))).toBe('00 0a ff');
    expect(toHex(new Uint8Array(600), 4)).toBe('00 00 00 00 …');
  });
  it('registra erros em anel e gera relatório', () => {
    clearErrors();
    reportError('teste', new Error('falhou'), { x: 1 });
    reportError('teste', 'texto simples', undefined, 'aviso');
    const errs = useDiag.getState().errors;
    expect(errs).toHaveLength(2);
    expect(errs[0].level).toBe('aviso');
    expect(errs[1].message).toBe('falhou');
    const rep = JSON.parse(errorReport({ tela: '/x' }));
    expect(rep.erros).toHaveLength(2);
    expect(rep.ambiente.appVersion).toBeTruthy();
  });
  it('captura é ignorada com o gravador desligado', () => {
    useDiag.setState({ capturing: false, captureCount: 0 });
    capture({ src: 't', kind: 'linha', data: 'x' });
    expect(useDiag.getState().captureCount).toBe(0);
  });
  it('captura bruta respeita a opção de bytes brutos', () => {
    useDiag.setState({ capturing: true, captureSession: 's', captureCount: 0, captureRaw: false });
    capture({ src: 't', kind: 'bruto', data: '00' });
    capture({ src: 't', kind: 'linha', data: 'x' });
    expect(useDiag.getState().captureCount).toBe(1);
    useDiag.setState({ capturing: false });
  });
  it('JSONL tem cabeçalho seguido dos registros', () => {
    const out = toJsonl([{ session: 's', seq: 0, t: 1, src: 'a', kind: 'linha', data: 'x' }], { sessao: 's' }).split(
      '\n',
    );
    expect(JSON.parse(out[0]).tipo).toBe('cabecalho');
    expect(JSON.parse(out[1]).data).toBe('x');
  });
});
