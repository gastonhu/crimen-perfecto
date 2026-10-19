import { hasDoor, hasWindow, isBlocked, isOnEdge, neighbors, objectAt, roomAt } from './board';
import { OBJECTS, type Cell, type Fact, type ObjectCode, type Person, type Puzzle, type Rule } from './types';

const UNARY = new Set([
  'inRoom', 'notInRoom', 'onObject', 'notOnObject', 'adjacentTo', 'notAdjacentTo', 'onEdge', 'notOnEdge', 'row', 'col',
  'byWindow', 'notByWindow', 'byDoor', 'notByDoor',
]);
const RELATIONAL = new Set(['sameRoomAs', 'notSameRoomAs', 'northOf', 'southOf', 'eastOf', 'westOf', 'touching', 'notTouching']);

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
    case 'byWindow':
      return hasWindow(p, c);
    case 'notByWindow':
      return !hasWindow(p, c);
    case 'byDoor':
      return hasDoor(p, c);
    case 'notByDoor':
      return !hasDoor(p, c);
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
    case 'touching':
      return Math.abs(self.r - other.r) === 1 && Math.abs(self.c - other.c) === 1;
    case 'notTouching':
      return !(Math.abs(self.r - other.r) === 1 && Math.abs(self.c - other.c) === 1);
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

/** Elige la forma según el género de quien habla (neutra si no hay dato). */
const g = (who: Person | undefined, f: string, m: string, x: string) => (who?.gender === 'f' ? f : who?.gender === 'm' ? m : x);

export function describeRule(p: Puzzle, rule: Rule, who?: Person): string {
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
    case 'touching':
      return who?.gender
        ? `estaba ${g(who, 'pegada', 'pegado', '')} a ${name(rule[1])}, en diagonal`
        : `estaba en diagonal, junto a ${name(rule[1])}`;
    case 'notTouching':
      return `no estaba en diagonal junto a ${name(rule[1])}`;
    case 'byWindow':
      return 'estaba junto a una ventana';
    case 'notByWindow':
      return 'no estaba junto a ninguna ventana';
    case 'byDoor':
      return 'estaba junto a una puerta';
    case 'notByDoor':
      return 'no estaba junto a ninguna puerta';
    case 'alone':
      return `estaba ${g(who, 'sola', 'solo', 'sin compañía')} en su habitación`;
    case 'withExactly':
      return `compartía la habitación con exactamente ${rule[1]} ${rule[1] === 1 ? 'persona' : 'personas'}`;
  }
}

const isFem = (roomName: string) => /^(la|las)\s/i.test(roomName);

export function describeFact(p: Puzzle, fact: Fact): string {
  const n = fact[2];
  if (fact[0] === 'roomCount') {
    const room = p.roomNames[fact[1]] ?? fact[1];
    if (n === 0) return cap(`${room} estaba ${isFem(room) ? 'vacía' : 'vacío'}.`);
    return `En ${room} había exactamente ${n} ${n === 1 ? 'persona' : 'personas'}.`;
  }
  const info = fact[1] === '.' ? null : OBJECTS[fact[1]];
  const obj = info ? info.indef : 'el piso';
  if (n === 0) return `Nadie estaba en ${obj}.`;
  return `Exactamente ${n === 1 ? 'una persona estaba' : `${n} personas estaban`} en ${n === 1 ? obj : (info?.plural ?? obj)}.`;
}

/** Une varias reglas en una frase: "Estaba en el Bar y junto a una planta." */
export function describeClue(p: Puzzle, rules: Rule[], who?: Person): string {
  const parts = rules.map((r, i) => {
    const s = describeRule(p, r, who);
    return i > 0 && s.startsWith('estaba ') ? s.slice('estaba '.length) : s;
  });
  if (parts.length === 0) return 'No recuerda nada.';
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
  return `${cap(joined)}.`;
}

export function clueText(p: Puzzle, person: Person): string {
  return person.clue.text ?? describeClue(p, person.clue.rules, person);
}
