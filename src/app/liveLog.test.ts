import { describe, expect, it } from 'vitest';
import { isLoopback } from '../../tools/liveLogPlugin';
import { liveEnabled } from './liveLog';

describe('canal ao vivo (versão de PC)', () => {
  it('servidor só aceita o próprio computador', () => {
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('::1')).toBe(true);
    expect(isLoopback('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopback('192.168.0.10')).toBe(false);
    expect(isLoopback(undefined)).toBe(false);
  });
  it('app só envia quando aberto em localhost', () => {
    expect(liveEnabled('localhost')).toBe(true);
    expect(liveEnabled('127.0.0.1')).toBe(true);
    expect(liveEnabled('eletricmotorz.web.app')).toBe(false);
    expect(liveEnabled('192.168.0.10')).toBe(false);
  });
});
