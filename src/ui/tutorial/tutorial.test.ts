import { describe, expect, it } from 'vitest';
import { killerOf, solve, structuralErrors } from '../../engine';
import { TUTORIAL } from './Tutorial';

describe('tutorial', () => {
  it('tiene solución única y el culpable que dice el texto', () => {
    expect(structuralErrors(TUTORIAL)).toEqual([]);
    const sols = solve(TUTORIAL, { limit: 2 });
    expect(sols).toHaveLength(1);
    expect(sols[0]).toEqual({ vera: { r: 0, c: 0 }, xavi: { r: 1, c: 1 }, yael: { r: 2, c: 2 } });
    expect(killerOf(TUTORIAL, sols[0])).toBe('xavi');
  });
});
