import { isBlocked, isOnEdge, neighbors, objectAt, roomAt } from './board';
import { OBJECTS, type Cell, type ObjectCode, type Person, type Puzzle, type Rule } from './types';

const UNARY = new Set(['inRoom', 'notInRoom', 'onObject', 'notOnObject', 'adjacentTo', 'notAdjacentTo', 'onEdge', 'notOnEdge', 'row', 'col']);
const RELATIONAL = new Set(['sameRoomAs', 'notSameRoomAs', 'northOf', 'southOf', 'eastOf', 'westOf']);

export const isUnary = (r: Rule) => UNARY.has(r[0]);
export const isRelational = (r: Rule) => RELATIONAL.has(r[0]);
export const isRoomCount = (r: Rule) => r[0] === 'alone' || r[0] === 'withExactly';

/** Cuántas OTRAS personas exige la regla en la habitación (alone = 0). */
export const roomCompanions = (r: Rule): number => (r[0] === 'alone' ? 0 : (r[1] as number));

export function evalUnary(p: Puzzle, rule: Rule, c: Cell): boolean {
  switch (rule[0]) {
    case 'inRoom':
      return roomAt(p, c) === rule[1];
    case 'notInRoom':
      return roomAt(p, c) !== rule[1];
    case 'onObject':
      return objectAt(p, c) === rule[1];
    case 'notOnObject':
      return objectAt(p, c) !== rule[1];
    case 'adjacentTo':
      return neighbors(p, c).some((n) => objectAt(p, n) === rule[1]);
    case 'notAdjacentTo':
      return !neighbors(p, c).some((n) => objectAt(p, n) === rule[1]);
    case 'onEdge':
      return isOnEdge(p, c);
    case 'notOnEdge':
      return !isOnEdge(p, c);
    case 'row':
      return c.r === rule[1] - 1;
    case 'col':
      return c.c === rule[1] - 1;
    default:
      return true;
  }
}

/** `self` es quien tiene la pista; `other` es la persona referenciada. */
export function evalRelational(p: Puzzle, rule: Rule, self: Cell, other: Cell): boolean {
  switch (rule[0]) {
    case 'sameRoomAs':
      return roomAt(p, self) === roomAt(p, other);
    case 'notSameRoomAs':
      return roomAt(p, self) !== roomAt(p, other);
    case 'northOf':
      return self.r < other.r;
    case 'southOf':
      return self.r > other.r;
    case 'westOf':
      return self.c < other.c;
    case 'eastOf':
      return self.c > other.c;
    default:
      return true;
  }
}

/** Casillas donde una persona puede estar según sus reglas unarias (y sin muebles bloqueantes). */
export function unaryDomain(p: Puzzle, person: Person): Cell[] {
  const out: Cell[] = [];
  const rules = person.clue.rules.filter(isUnary);
  for (let r = 0; r < p.size; r++)
    for (let c = 0; c < p.size; c++) {
      const cell = { r, c };
      if (!isBlocked(p, cell) && rules.every((rule) => evalUnary(p, rule, cell))) out.push(cell);
    }
  return out;
}

// ---------- Texto en castellano ----------

export const colLabel = (c: number) => String.fromCharCode(65 + c);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function roomLabel(p: Puzzle, id: string): string {
  return cap(p.roomNames[id] ?? id);
}

function objIndef(code: ObjectCode): string {
  return code === '.' ? 'el piso' : OBJECTS[code].indef;
}

export function describeRule(p: Puzzle, rule: Rule): string {
  const name = (id: string) => p.people.find((x) => x.id === id)?.name ?? id;
  switch (rule[0]) {
    case 'inRoom':
      return `estaba en ${p.roomNames[rule[1]]}`;
    case 'notInRoom':
      return `no estaba en ${p.roomNames[rule[1]]}`;
    case 'onObject':
      return `estaba en ${objIndef(rule[1])}`;
    case 'notOnObject':
      return `no estaba en ${objIndef(rule[1])}`;
    case 'adjacentTo':
      return `estaba junto a ${objIndef(rule[1])}`;
    case 'notAdjacentTo':
      return `no tenía ${objIndef(rule[1])} al lado`;
    case 'onEdge':
      return 'estaba contra una pared exterior';
    case 'notOnEdge':
      return 'no estaba contra ninguna pared exterior';
    case 'row':
      return `estaba en la fila ${rule[1]}`;
    case 'col':
      return `estaba en la columna ${colLabel(rule[1] - 1)}`;
    case 'sameRoomAs':
      return `estaba en la misma habitación que ${name(rule[1])}`;
    case 'notSameRoomAs':
      return `no estaba en la misma habitación que ${name(rule[1])}`;
    case 'northOf':
      return `estaba más al norte que ${name(rule[1])}`;
    case 'southOf':
      return `estaba más al sur que ${name(rule[1])}`;
    case 'eastOf':
      return `estaba más al este que ${name(rule[1])}`;
    case 'westOf':
      return `estaba más al oeste que ${name(rule[1])}`;
    case 'alone':
      return 'estaba sin compañía en su habitación';
    case 'withExactly':
      return `compartía la habitación con exactamente ${rule[1]} ${rule[1] === 1 ? 'persona' : 'personas'}`;
  }
}

/** Une varias reglas en una frase: "Estaba en el Bar y junto a una planta." */
export function describeClue(p: Puzzle, rules: Rule[]): string {
  const parts = rules.map((r, i) => {
    const s = describeRule(p, r);
    return i > 0 && s.startsWith('estaba ') ? s.slice('estaba '.length) : s;
  });
  if (parts.length === 0) return 'No recuerda nada.';
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
  return `${cap(joined)}.`;
}

export function clueText(p: Puzzle, person: Person): string {
  return person.clue.text ?? describeClue(p, person.clue.rules);
}
