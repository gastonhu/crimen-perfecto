// Validación liviana (sin dependencias) del formato de archivo v2 de un caso publicado. Replica lo esencial de
// scripts/schema.ts (zod) para poder usarla en el navegador sin meter zod en el bundle. Un test verifica que las
// dos coincidan en qué archivos aceptan.

export const FILE_SCHEMA_VERSION = 2;

const ID = /^[a-z0-9-]+$/;
const SIDE_REF = /^[A-I][1-9][NSEO]$/;
const OBJECT_CODES = ['.', 'T', 'S', 'P', 'V', 'K', 'M', 'C', 'B', 'R'];

const RULES_BY_ARG: Record<string, 'room' | 'object' | 'none' | 'line' | 'person' | 'count'> = {
  inRoom: 'room',
  notInRoom: 'room',
  onObject: 'object',
  notOnObject: 'object',
  adjacentTo: 'object',
  notAdjacentTo: 'object',
  onEdge: 'none',
  notOnEdge: 'none',
  byWindow: 'none',
  notByWindow: 'none',
  byDoor: 'none',
  notByDoor: 'none',
  alone: 'none',
  row: 'line',
  col: 'line',
  sameRoomAs: 'person',
  notSameRoomAs: 'person',
  northOf: 'person',
  southOf: 'person',
  eastOf: 'person',
  westOf: 'person',
  touching: 'person',
  notTouching: 'person',
  withExactly: 'count',
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isStr = (v: unknown): v is string => typeof v === 'string';

function ruleError(rule: unknown): string | null {
  if (!Array.isArray(rule) || !isStr(rule[0]) || !(rule[0] in RULES_BY_ARG)) return 'regla desconocida';
  const kind = RULES_BY_ARG[rule[0]];
  const len = kind === 'none' ? 1 : 2;
  if (rule.length !== len) return `la regla ${rule[0]} lleva ${len - 1} argumento${len === 2 ? '' : 's'}`;
  const arg = rule[1];
  switch (kind) {
    case 'room':
      return isStr(arg) && arg.length === 1 ? null : 'habitación inválida';
    case 'object':
      return isStr(arg) && OBJECT_CODES.includes(arg) ? null : 'mueble inválido';
    case 'line':
      return isInt(arg, 1, 9) ? null : 'fila o columna fuera de rango';
    case 'person':
      return isStr(arg) && ID.test(arg) ? null : 'persona inválida';
    case 'count':
      return isInt(arg, 0, 8) ? null : 'cantidad fuera de rango';
    default:
      return null;
  }
}

function factError(fact: unknown): string | null {
  if (!Array.isArray(fact) || fact.length !== 3) return 'hecho inválido';
  const [kind, what, n] = fact;
  if (kind === 'roomCount') return isStr(what) && what.length === 1 && isInt(n, 0, 9) ? null : 'hecho de habitación inválido';
  if (kind === 'objectCount') return isStr(what) && OBJECT_CODES.includes(what) && isInt(n, 0, 9) ? null : 'hecho de mueble inválido';
  return 'hecho desconocido';
}

function onlyKeys(o: Record<string, unknown>, allowed: string[], path: string, errs: string[]) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) errs.push(`${path}: campo desconocido '${k}'`);
}

const PUZZLE_KEYS = [
  'schemaVersion', 'id', 'theme', 'title', 'size', 'difficulty', 'story', 'epilogue', 'rooms', 'roomNames', 'objects',
  'windows', 'doors', 'people', 'facts', 'crime',
];

/**
 * Errores de forma de un archivo de caso publicado (vacío si está bien). Mismas reglas que `puzzleSchema` de
 * scripts/schema.ts: campos obligatorios, tipos, rangos y sin campos de más (por ejemplo, `solution`).
 */
export function fileFormatErrors(json: unknown): string[] {
  const errs: string[] = [];
  if (!isObj(json)) return ['(raíz): tiene que ser un objeto'];
  const j = json;
  onlyKeys(j, PUZZLE_KEYS, '(raíz)', errs);
  if (j.schemaVersion !== FILE_SCHEMA_VERSION) errs.push(`schemaVersion: tiene que ser ${FILE_SCHEMA_VERSION}`);
  for (const k of ['id', 'theme'])
    if (!isStr(j[k]) || !ID.test(j[k] as string)) errs.push(`${k}: solo minúsculas, números y guiones`);
  if (!isStr(j.title) || j.title.length < 3 || j.title.length > 60) errs.push('title: entre 3 y 60 caracteres');
  if (!isInt(j.size, 3, 9)) errs.push('size: entero entre 3 y 9');
  if (!isInt(j.difficulty, 1, 5)) errs.push('difficulty: entero entre 1 y 5');
  if (!isStr(j.story) || j.story.length < 10) errs.push('story: al menos 10 caracteres');
  if (j.epilogue !== undefined && (!isStr(j.epilogue) || !j.epilogue.includes('{killer}')))
    errs.push('epilogue: el epílogo tiene que nombrar al culpable con {killer}');
  if (!Array.isArray(j.rooms) || j.rooms.some((r) => !isStr(r) || !/^[A-Z]+$/.test(r))) errs.push('rooms: filas de letras mayúsculas');
  if (!isObj(j.roomNames) || Object.entries(j.roomNames).some(([k, v]) => k.length !== 1 || !isStr(v) || v.length < 2))
    errs.push('roomNames: cada habitación es una letra con un nombre de al menos 2 caracteres');
  if (!Array.isArray(j.objects) || j.objects.some((r) => !isStr(r) || !/^[.TSPVKMCBR]+$/.test(r))) errs.push('objects: filas de códigos de mueble');
  for (const k of ['windows', 'doors'])
    if (j[k] !== undefined && (!Array.isArray(j[k]) || (j[k] as unknown[]).some((x) => !isStr(x) || !SIDE_REF.test(x))))
      errs.push(`${k}: formato "B1N": columna, fila y lado (N, S, E u O)`);
  if (!Array.isArray(j.people)) errs.push('people: tiene que ser una lista');
  else
    j.people.forEach((x, i) => {
      const path = `people.${i}`;
      if (!isObj(x)) return errs.push(`${path}: tiene que ser un objeto`);
      onlyKeys(x, ['id', 'name', 'role', 'avatar', 'gender', 'clue'], path, errs);
      if (!isStr(x.id) || !ID.test(x.id)) errs.push(`${path}.id: solo minúsculas, números y guiones`);
      if (!isStr(x.name) || x.name.length < 1 || x.name.length > 30) errs.push(`${path}.name: entre 1 y 30 caracteres`);
      if (x.role !== 'victim' && x.role !== 'suspect') errs.push(`${path}.role: victim o suspect`);
      if (!isStr(x.avatar)) errs.push(`${path}.avatar: tiene que ser texto`);
      if (x.gender !== undefined && x.gender !== 'f' && x.gender !== 'm') errs.push(`${path}.gender: f o m`);
      const clue = x.clue;
      if (!isObj(clue)) return errs.push(`${path}.clue: tiene que ser un objeto`);
      onlyKeys(clue, ['text', 'rules'], `${path}.clue`, errs);
      if (clue.text !== undefined && !isStr(clue.text)) errs.push(`${path}.clue.text: tiene que ser texto`);
      if (!Array.isArray(clue.rules)) errs.push(`${path}.clue.rules: tiene que ser una lista`);
      else
        clue.rules.forEach((r, k) => {
          const e = ruleError(r);
          if (e) errs.push(`${path}.clue.rules.${k}: ${e}`);
        });
    });
  if (j.facts !== undefined) {
    if (!Array.isArray(j.facts)) errs.push('facts: tiene que ser una lista');
    else
      j.facts.forEach((f, i) => {
        if (!isObj(f)) return errs.push(`facts.${i}: tiene que ser un objeto`);
        onlyKeys(f, ['text', 'fact'], `facts.${i}`, errs);
        if (f.text !== undefined && !isStr(f.text)) errs.push(`facts.${i}.text: tiene que ser texto`);
        const e = factError(f.fact);
        if (e) errs.push(`facts.${i}: ${e}`);
      });
  }
  if (j.crime !== undefined && j.crime !== 'aloneWithVictim' && j.crime !== 'touchingVictim')
    errs.push('crime: aloneWithVictim o touchingVictim');
  return errs;
}
