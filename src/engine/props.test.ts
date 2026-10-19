// Tests de propiedades: el solver y la propagación se comparan contra una fuerza bruta independiente
// sobre miles de casos aleatorios chicos.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cellKey, deduce, killerOf, propagate, solve, violations, type Placement, type Puzzle, type Rule } from '.';

// ---------- Semántica de referencia (independiente del motor) ----------

const RUNS = Number(process.env.FC_RUNS ?? 300);
const BLOCKING = new Set(['T', 'S', 'P', 'V', 'K', 'M']);

function refHolds(p: Puzzle, sol: Placement, selfId: string, rule: Rule): boolean {
  const n = p.size;
  const me = sol[selfId];
  const room = (r: number, c: number) => p.rooms[r][c];
  const obj = (r: number, c: number) => p.objects[r][c];
  const near = [
    [me.r - 1, me.c],
    [me.r + 1, me.c],
    [me.r, me.c - 1],
    [me.r, me.c + 1],
  ].filter(([r, c]) => r >= 0 && c >= 0 && r < n && c < n);
  const occupants = (rid: string) => p.people.filter((x) => room(sol[x.id].r, sol[x.id].c) === rid).length;
  const other = (id: string) => sol[id];
  const diag = (a: { r: number; c: number }, b: { r: number; c: number }) => Math.abs(a.r - b.r) === 1 && Math.abs(a.c - b.c) === 1;
  // Ventanas y puertas: "B1N" = casilla B1, lado norte. Una puerta vale para las dos casillas que separa.
  const touchesRef = (refs: string[] = [], both: boolean) =>
    refs.some((ref) => {
      const r = Number(ref[1]) - 1;
      const c = ref.charCodeAt(0) - 65;
      const [dr, dc] = { N: [-1, 0], S: [1, 0], E: [0, 1], O: [0, -1] }[ref[2] as 'N']!;
      return (me.r === r && me.c === c) || (both && me.r === r + dr && me.c === c + dc);
    });
  switch (rule[0]) {
    case 'inRoom': return room(me.r, me.c) === rule[1];
    case 'notInRoom': return room(me.r, me.c) !== rule[1];
    case 'onObject': return obj(me.r, me.c) === rule[1];
    case 'notOnObject': return obj(me.r, me.c) !== rule[1];
    case 'adjacentTo': return near.some(([r, c]) => obj(r, c) === rule[1]);
    case 'notAdjacentTo': return !near.some(([r, c]) => obj(r, c) === rule[1]);
    case 'onEdge': return me.r === 0 || me.c === 0 || me.r === n - 1 || me.c === n - 1;
    case 'notOnEdge': return !(me.r === 0 || me.c === 0 || me.r === n - 1 || me.c === n - 1);
    case 'row': return me.r + 1 === rule[1];
    case 'col': return me.c + 1 === rule[1];
    case 'sameRoomAs': return room(me.r, me.c) === room(other(rule[1]).r, other(rule[1]).c);
    case 'notSameRoomAs': return room(me.r, me.c) !== room(other(rule[1]).r, other(rule[1]).c);
    case 'northOf': return me.r < other(rule[1]).r;
    case 'southOf': return me.r > other(rule[1]).r;
    case 'westOf': return me.c < other(rule[1]).c;
    case 'eastOf': return me.c > other(rule[1]).c;
    case 'touching': return diag(me, other(rule[1]));
    case 'notTouching': return !diag(me, other(rule[1]));
    case 'byWindow': return touchesRef(p.windows, false);
    case 'notByWindow': return !touchesRef(p.windows, false);
    case 'byDoor': return touchesRef(p.doors, true);
    case 'notByDoor': return !touchesRef(p.doors, true);
    case 'alone': return occupants(room(me.r, me.c)) === 1;
    case 'withExactly': return occupants(room(me.r, me.c)) - 1 === rule[1];
  }
}

function refIsSolution(p: Puzzle, sol: Placement): boolean {
  const cells = p.people.map((x) => sol[x.id]);
  if (new Set(cells.map((c) => c.r)).size !== p.size || new Set(cells.map((c) => c.c)).size !== p.size) return false;
  if (cells.some((c) => BLOCKING.has(p.objects[c.r][c.c]))) return false;
  const victim = p.people.find((x) => x.role === 'victim')!;
  const v = sol[victim.id];
  if (p.crime === 'touchingVictim') {
    const near = p.people.filter((x) => x.id !== victim.id && Math.abs(sol[x.id].r - v.r) === 1 && Math.abs(sol[x.id].c - v.c) === 1);
    if (near.length !== 1) return false;
  } else if (p.people.filter((x) => p.rooms[sol[x.id].r][sol[x.id].c] === p.rooms[v.r][v.c]).length !== 2) return false;
  for (const { fact } of p.facts ?? []) {
    const count = cells.filter((c) => (fact[0] === 'roomCount' ? p.rooms[c.r][c.c] : p.objects[c.r][c.c]) === fact[1]).length;
    if (count !== fact[2]) return false;
  }
  return p.people.every((x) => x.clue.rules.every((rule) => refHolds(p, sol, x.id, rule)));
}

function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  return permutations(n - 1).flatMap((perm) => Array.from({ length: n }, (_, i) => [...perm.slice(0, i), n - 1, ...perm.slice(i)]));
}

/** Todas las soluciones por fuerza bruta: persona i en (filas[i], columnas[i]). */
function bruteForce(p: Puzzle): string[] {
  const perms = permutations(p.size);
  const out: string[] = [];
  for (const rows of perms)
    for (const cols of perms) {
      const sol: Placement = {};
      p.people.forEach((x, i) => (sol[x.id] = { r: rows[i], c: cols[i] }));
      if (refIsSolution(p, sol)) out.push(serialize(p, sol));
    }
  return out.sort();
}

const serialize = (p: Puzzle, sol: Placement) => p.people.map((x) => cellKey(sol[x.id])).join('|');

// ---------- Generador de casos aleatorios ----------

const OBJ = ['.', '.', '.', '.', 'T', 'P', 'C', 'B', 'R'];

const puzzleArb = fc.integer({ min: 3, max: 5 }).chain((n) =>
  fc
    .record({
      seeds: fc.array(fc.tuple(fc.nat(n - 1), fc.nat(n - 1)), { minLength: 2, maxLength: 4 }),
      objects: fc.array(fc.constantFrom(...OBJ), { minLength: n * n, maxLength: n * n }),
      clues: fc.array(fc.array(fc.tuple(fc.nat(23), fc.nat(20)), { maxLength: 2 }), { minLength: n, maxLength: n }),
      sides: fc.array(fc.tuple(fc.nat(n - 1), fc.nat(n - 1), fc.constantFrom('N', 'S', 'E', 'O')), { maxLength: 4 }),
      facts: fc.array(fc.tuple(fc.boolean(), fc.nat(3), fc.nat(n)), { maxLength: 2 }),
      touching: fc.boolean(),
    })
    .map(({ seeds, objects, clues, sides, facts, touching }): Puzzle => {
      const letters = 'ABCD';
      const rooms = Array.from({ length: n }, (_, r) =>
        Array.from({ length: n }, (_, c) => {
          let best = 0;
          seeds.forEach(([sr, sc], i) => {
            const [br, bc] = seeds[best];
            if (Math.abs(sr - r) + Math.abs(sc - c) < Math.abs(br - r) + Math.abs(bc - c)) best = i;
          });
          return letters[best];
        }).join(''),
      );
      const roomList = [...new Set(rooms.join(''))];
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const mkRule = ([kind, arg]: [number, number], self: string): Rule => {
        const other = ids.filter((x) => x !== self)[arg % (n - 1)];
        const room = roomList[arg % roomList.length];
        const objc = (['T', 'P', 'C', 'B', 'R'] as const)[arg % 5];
        const kinds: Rule[] = [
          ['inRoom', room], ['notInRoom', room], ['onObject', objc], ['notOnObject', objc], ['adjacentTo', objc],
          ['notAdjacentTo', objc], ['onEdge'], ['notOnEdge'], ['row', (arg % n) + 1], ['col', (arg % n) + 1],
          ['sameRoomAs', other], ['notSameRoomAs', other], ['northOf', other], ['southOf', other], ['eastOf', other],
          ['westOf', other], ['alone'], ['withExactly', arg % 3], ['touching', other], ['notTouching', other],
          ['byWindow'], ['notByWindow'], ['byDoor'], ['notByDoor'],
        ];
        return kinds[kind];
      };
      return {
        id: 'rand', theme: 'test', title: 'rand', size: n, difficulty: 1, story: '',
        rooms,
        roomNames: Object.fromEntries(roomList.map((l) => [l, `la sala ${l}`])),
        objects: Array.from({ length: n }, (_, r) => objects.slice(r * n, r * n + n).join('')),
        ...(() => {
          // Ventanas en lados exteriores y puertas entre habitaciones distintas (descarta las inválidas).
          const windows: string[] = [];
          const doors: string[] = [];
          for (const [r, c, side] of sides) {
            const [dr, dc] = { N: [-1, 0], S: [1, 0], E: [0, 1], O: [0, -1] }[side as 'N']!;
            const ref = `${String.fromCharCode(65 + c)}${r + 1}${side}`;
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nc < 0 || nr >= n || nc >= n) windows.push(ref);
            else if (rooms[nr][nc] !== rooms[r][c]) doors.push(ref);
          }
          return { windows, doors };
        })(),
        facts: facts.map(([isRoom, k, count]) => ({
          fact: isRoom ? ['roomCount', roomList[k % roomList.length], count] : ['objectCount', (['C', 'B', 'R'] as const)[k % 3], count],
        })),
        crime: touching ? 'touchingVictim' : undefined,
        people: ids.map((id, i) => ({
          id, name: id.toUpperCase(), avatar: '', role: i === 0 ? 'victim' : 'suspect',
          clue: { rules: clues[i].map((c) => mkRule(c, id)) },
        })),
      };
    }),
);

describe('propiedades del motor', { timeout: 300_000 }, () => {
  it('el solver encuentra exactamente las soluciones de la fuerza bruta', () => {
    fc.assert(
      fc.property(puzzleArb, (p) => {
        const expected = bruteForce(p);
        const got = solve(p, { limit: Infinity }).map((s) => serialize(p, s)).sort();
        expect(got).toEqual(expected);
      }),
      { numRuns: RUNS },
    );
  });

  it('la propagación nunca descarta una casilla de una solución', () => {
    fc.assert(
      fc.property(puzzleArb, (p) => {
        const { domains } = propagate(p);
        for (const sol of solve(p, { limit: 20 }))
          for (const x of p.people) expect(domains[x.id].map(cellKey)).toContain(cellKey(sol[x.id]));
      }),
      { numRuns: RUNS },
    );
  });

  it('toda solución está libre de violaciones y tiene un culpable', () => {
    fc.assert(
      fc.property(puzzleArb, (p) => {
        for (const sol of solve(p, { limit: 5 })) {
          expect(violations(p, sol)).toEqual([]);
          expect(killerOf(p, sol)).not.toBeNull();
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('ningún paso de deducción descarta una casilla de una solución', () => {
    fc.assert(
      fc.property(puzzleArb, (p) => {
        const sols = solve(p, { limit: 20 });
        if (!sols.length) return;
        const r = deduce(p);
        expect(r.contradiction).toBeNull();
        for (const step of r.steps)
          for (const [id, cells] of Object.entries(step.removed))
            for (const sol of sols) expect(cells.map(cellKey), `${step.technique}: ${step.reason}`).not.toContain(cellKey(sol[id]));
        if (r.solved) {
          expect(sols).toHaveLength(1);
          for (const x of p.people) expect(r.domains[x.id]).toEqual([sols[0][x.id]]);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('si no hay solución, la deducción no llega a una solución falsa', () => {
    fc.assert(
      fc.property(puzzleArb, (p) => {
        if (solve(p, { limit: 1 }).length) return;
        expect(deduce(p).solved).toBe(false);
      }),
      { numRuns: RUNS },
    );
  });
});
