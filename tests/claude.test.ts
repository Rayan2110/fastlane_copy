import {describe, it, expect} from 'vitest';
import {extractJson} from '../lib/claude';

describe('extractJson', () => {
  it('parse du JSON pur', () => {
    expect(extractJson<{a: number}>('{"a": 1}')).toEqual({a: 1});
  });

  it('parse un tableau dans des fences markdown', () => {
    const raw = 'Voici les scripts :\n```json\n[{"a": 1}, {"a": 2}]\n```\nVoilà !';
    expect(extractJson<{a: number}[]>(raw)).toEqual([{a: 1}, {a: 2}]);
  });

  it('parse un objet noye dans du texte', () => {
    const raw = 'Bla bla {"hook": "test", "n": [1, 2]} et ensuite';
    expect(extractJson<{hook: string}>(raw).hook).toBe('test');
  });

  it('throw sur une entree sans JSON', () => {
    expect(() => extractJson('aucun json ici')).toThrow();
  });
});
