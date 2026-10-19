import { describe, expect, it } from 'vitest';
import type { Person } from '../engine';
import { initials } from './initials';

const person = (id: string, name: string) => ({ id, name }) as Person;

describe('initials', () => {
  it('usa la inicial sola si no choca', () => {
    expect([...initials([person('a', 'Ana'), person('b', 'Bruno')]).values()]).toEqual(['A', 'B']);
  });
  it('desambigua nombres que empiezan igual', () => {
    const m = initials([person('r', 'Don Ruiz'), person('a', 'Ana'), person('d', 'Diego')]);
    expect(m.get('a')).toBe('A');
    expect(m.get('r')).toBe('DR');
    expect(m.get('d')).toBe('Di');
  });
  it('siempre da etiquetas distintas', () => {
    const m = initials([person('1', 'Sol'), person('2', 'Sol'), person('3', 'Sara')]);
    expect(new Set(m.values()).size).toBe(3);
  });
});
