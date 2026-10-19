// Agregados del motor para el editor de casos: reglas fijadas en generateClues y validación liviana del formato.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { schemaErrors } from '../../scripts/schema';
import { candidateRules, fileFormatErrors, generateClues, solve, type Puzzle, type Rule } from '.';

const load = (f: string): Puzzle => JSON.parse(readFileSync(new URL(`../../puzzles/${f}`, import.meta.url), 'utf8'));
const FILES = ['hotel/hotel-01.json', 'tren/tren-01.json', 'datacenter/datacenter-01.json'];

describe('generateClues con reglas fijadas', () => {
  const hotel = load('hotel/hotel-01.json');
  const solution = solve(hotel, { limit: 1 })[0];
  const base: Puzzle = { ...hotel, people: hotel.people.map((x) => ({ ...x, clue: { rules: [] } })) };

  it('respeta las reglas del autor, no las poda y la solución queda única', () => {
    const [a, b] = base.people;
    const ruleA = candidateRules(base, solution, a.id).find((c) => c.rule[0] === 'notOnEdge' || c.rule[0] === 'onEdge')!.rule;
    const ruleB = candidateRules(base, solution, b.id).find((c) => c.rule[0] === 'row')!.rule;
    const fixed: Record<string, Rule[]> = { [a.id]: [ruleA], [b.id]: [ruleB] };
    for (const seed of [1, 2, 3]) {
      const p = generateClues(base, solution, { seed, fixed });
      expect(p.people.find((x) => x.id === a.id)!.clue.rules).toContainEqual(ruleA);
      expect(p.people.find((x) => x.id === b.id)!.clue.rules).toContainEqual(ruleB);
      const sols = solve(p, { limit: 2 });
      expect(sols).toHaveLength(1);
      expect(sols[0]).toEqual(solution);
    }
  });

  it('si las reglas fijadas ya alcanzan, no agrega nada para esas personas', () => {
    const full = Object.fromEntries(hotel.people.map((x) => [x.id, x.clue.rules]));
    const p = generateClues(base, solution, { fixed: full });
    expect(p.people.map((x) => x.clue.rules)).toEqual(hotel.people.map((x) => x.clue.rules));
  });

  it('rechaza una regla fijada falsa', () => {
    const a = base.people[0];
    const wrong: Rule = ['row', solution[a.id].r === 0 ? 2 : 1];
    expect(() => generateClues(base, solution, { fixed: { [a.id]: [wrong] } })).toThrow(/no se cumplen/);
  });

  it('sin reglas fijadas da lo mismo que antes', () => {
    expect(generateClues(base, solution, { seed: 5, fixed: {} })).toEqual(generateClues(base, solution, { seed: 5 }));
  });
});

describe('fileFormatErrors coincide con el esquema zod', () => {
  for (const f of FILES)
    it(`acepta ${f}`, () => {
      expect(fileFormatErrors(load(f))).toEqual([]);
      expect(schemaErrors(load(f))).toEqual([]);
    });

  const hotel = load('hotel/hotel-01.json');
  const person0 = hotel.people[0];
  type Json = Record<string, unknown>;
  const withPerson = (patch: Json) => ({ ...hotel, people: [{ ...person0, ...patch }, ...hotel.people.slice(1)] });
  const withRules = (rules: unknown[]) => withPerson({ clue: { rules } });
  const mutations: [string, unknown][] = [
    ['sin schemaVersion', { ...hotel, schemaVersion: undefined }],
    ['schemaVersion 1', { ...hotel, schemaVersion: 1 }],
    ['id con mayúsculas', { ...hotel, id: 'Hotel-01' }],
    ['tema con espacio', { ...hotel, theme: 'mi tema' }],
    ['título corto', { ...hotel, title: 'ab' }],
    ['título largo', { ...hotel, title: 'x'.repeat(61) }],
    ['size 10', { ...hotel, size: 10 }],
    ['size 2.5', { ...hotel, size: 2.5 }],
    ['difficulty 0', { ...hotel, difficulty: 0 }],
    ['difficulty 6', { ...hotel, difficulty: 6 }],
    ['historia corta', { ...hotel, story: 'corta' }],
    ['epílogo sin {killer}', { ...hotel, epilogue: 'Fin.' }],
    ['epílogo con {killer}', { ...hotel, epilogue: 'Fue {killer}.' }],
    ['rooms con minúscula', { ...hotel, rooms: ['abc'] }],
    ['roomNames con clave larga', { ...hotel, roomNames: { ...hotel.roomNames, AB: 'el ab' } }],
    ['roomNames con nombre corto', { ...hotel, roomNames: { ...hotel.roomNames, L: 'x' } }],
    ['objects inválidos', { ...hotel, objects: ['..X..'] }],
    ['ventana bien', { ...hotel, windows: ['A1N'] }],
    ['ventana mal', { ...hotel, windows: ['A1X'] }],
    ['puerta mal', { ...hotel, doors: ['J1N'] }],
    ['con solución', { ...hotel, solution: { ruiz: [1, 1] } }],
    ['campo extra en persona', withPerson({ notes: 'x' })],
    ['nombre vacío', withPerson({ name: '' })],
    ['nombre largo', withPerson({ name: 'x'.repeat(31) })],
    ['rol inválido', withPerson({ role: 'killer' })],
    ['género inválido', withPerson({ gender: 'x' })],
    ['avatar numérico', withPerson({ avatar: 3 })],
    ['texto de pista', withPerson({ clue: { text: 'Hola.', rules: [] } })],
    ['campo extra en pista', withPerson({ clue: { rules: [], extra: 1 } })],
    ['regla desconocida', withRules([['flying']])],
    ['regla sin argumento', withRules([['inRoom']])],
    ['regla con argumento de más', withRules([['onEdge', 1]])],
    ['fila 0', withRules([['row', 0]])],
    ['fila 9', withRules([['row', 9]])],
    ['withExactly 9', withRules([['withExactly', 9]])],
    ['withExactly 0', withRules([['withExactly', 0]])],
    ['persona inválida', withRules([['northOf', 'Ana']])],
    ['mueble inválido', withRules([['onObject', 'X']])],
    ['piso como mueble', withRules([['onObject', '.']])],
    ['habitación larga', withRules([['inRoom', 'LL']])],
    ['hecho bien', { ...hotel, facts: [{ fact: ['roomCount', 'L', 1] }] }],
    ['hecho con texto', { ...hotel, facts: [{ text: 'x', fact: ['objectCount', 'C', 2] }] }],
    ['hecho desconocido', { ...hotel, facts: [{ fact: ['peopleCount', 'L', 1] }] }],
    ['hecho fuera de rango', { ...hotel, facts: [{ fact: ['roomCount', 'L', 10] }] }],
    ['hecho con campo extra', { ...hotel, facts: [{ fact: ['roomCount', 'L', 1], x: 1 }] }],
    ['crimen bien', { ...hotel, crime: 'touchingVictim' }],
    ['crimen mal', { ...hotel, crime: 'poison' }],
    ['no es objeto', [1, 2]],
  ];
  for (const [name, json] of mutations)
    it(name, () => {
      const clean = JSON.parse(JSON.stringify(json));
      expect(fileFormatErrors(clean).length === 0).toBe(schemaErrors(clean).length === 0);
    });
});
