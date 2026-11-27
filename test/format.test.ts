import { it, expect } from 'vitest';
import { fmtPhone, fmtThousands, numv } from '../src/lib/util';
it('ezres tagolás', () => {
  expect(fmtThousands('1250000')).toBe('1 250 000'); expect(fmtThousands('-2362205')).toBe('-2 362 205');
  expect(fmtThousands('12 50 000')).toBe('1 250 000'); expect(fmtThousands('1000,5')).toBe('1 000,5'); expect(fmtThousands('')).toBe('');
  expect(numv(fmtThousands('1250000'))).toBe(1250000); expect(numv('1 000,5')).toBe(1000.5);
});
it('telefonszám', () => {
  const c: [string, string][] = [['06301234567', '+36 30 123 4567'], ['+36301234567', '+36 30 123 4567'], ['+36 30 123 4567', '+36 30 123 4567'], ['301234567', '+36 30 123 4567'],
    ['0612345678', '+36 1 234 5678'], ['+36 0', '+36 0'], ['+36 06', '+36 06'], ['+36 063', '+36 3'], ['+36 ', '+36 '], ['+3', '+3'], ['+44 20 7946 0958', '+44 20 7946 0958'], ['0036201112222', '+36 20 111 2222'], ['36301234567', '+36 30 123 4567'], ['+36 +36 30 555 1234', '+36 30 555 1234'], ['+36 +', '+36 +'], ['+36 +3', '+36 +3'], ['+36 +36', '+36 ']];
  for (const [a, b] of c) expect([a, fmtPhone(a)]).toEqual([a, b]);
});
