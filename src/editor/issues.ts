// Problemas de un borrador, explicados en castellano y agrupados por paso del editor.
import { draftErrors, isBlocked, killerOf, roomIds, violations, factViolations, type Puzzle } from '../engine';
import { splitRooms, toPlacement, toPuzzle, type DraftFile } from './draft';

const ID = /^[a-z0-9-]+$/;

export interface Issue {
  /** Bloquea el paso siguiente (error) o es solo un aviso. */
  level: 'error' | 'warning';
  text: string;
}

const err = (text: string): Issue => ({ level: 'error', text });
const warn = (text: string): Issue => ({ level: 'warning', text });

const nameOf = (d: DraftFile, id: string) => d.people.find((x) => x.id === id)?.name || id;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

/** Traduce un error del motor a una frase para el autor (nombres en vez de ids, sin jerga del formato). */
export function humanize(d: DraftFile, msg: string): string {
  let m = msg;
  m = m.replace(/^rooms debe ser (\d+)x\d+$/, 'El plano de habitaciones tiene que ser de $1×$1.');
  m = m.replace(/^objects debe ser (\d+)x\d+$/, 'El plano de muebles tiene que ser de $1×$1.');
  m = m.replace(/^habitación '(.)' sin nombre$/, 'La habitación $1 no tiene nombre.');
  m = m.replace(/^hacen falta (\d+) personas \(hay (\d+)\)$/, 'Hacen falta $1 personas (una por fila) y hay $2.');
  m = m.replace(/^debe haber exactamente una víctima$/, 'Tiene que haber exactamente una víctima.');
  m = m.replace(/^ids de personas repetidos$/, 'Hay dos personas con el mismo identificador.');
  m = m.replace(/^falta la solución de alguna persona$/, () => {
    const missing = d.people.filter((x) => !d.solution[x.id]).map((x) => x.name || x.id);
    return `Falta ubicar a ${list(missing)}.`;
  });
  m = m.replace(/^la solución repite fila o columna$/, 'Hay dos personas en la misma fila o columna.');
  m = m.replace(/^tiene que haber exactamente una persona pegada en diagonal a la víctima$/, 'Tiene que haber exactamente una persona pegada en diagonal a la víctima.');
  m = m.replace(/^la víctima no queda a solas con exactamente un sospechoso$/, 'La víctima tiene que compartir su habitación con un solo sospechoso: el culpable.');
  m = m.replace(/^en la habitación de la víctima tiene que haber exactamente una persona más$/, 'En la habitación de la víctima tiene que haber exactamente una persona más.');
  m = m.replace(/^la solución no cumple algún hecho general$/, 'La solución no cumple algún hecho general (revisalos en "Pistas").');
  m = m.replace(/^la ventana '(.+)' no está en una pared exterior$/, 'La ventana $1 no está en una pared exterior.');
  m = m.replace(/^la puerta '(.+)' no separa dos habitaciones$/, 'La puerta $1 no separa dos habitaciones.');
  m = m.replace(/^([a-z0-9-]+) está sobre un mueble$/, (_, id) => `${nameOf(d, id)} está sobre un mueble que bloquea la casilla.`);
  m = m.replace(/^([a-z0-9-]+): referencia a persona inexistente '(.+)'$/, (_, id, o) => `La pista de ${nameOf(d, id)} nombra a alguien que ya no está (${o}).`);
  m = m.replace(/^([a-z0-9-]+): habitación inexistente '(.+)'$/, (_, id, o) => `La pista de ${nameOf(d, id)} nombra una habitación que ya no existe (${o}).`);
  m = m.replace(/^([a-z0-9-]+): (row|col) fuera de rango$/, (_, id, k) => `La pista de ${nameOf(d, id)} nombra una ${k === 'row' ? 'fila' : 'columna'} fuera del plano.`);
  m = m.replace(/^hecho con habitación inexistente '(.+)'$/, 'Un hecho general nombra una habitación que ya no existe ($1).');
  m = m.replace(/^hecho con cantidad fuera de rango \((.+)\)$/, 'Un hecho general tiene una cantidad fuera de rango ($1).');
  return m.charAt(0).toUpperCase() + m.slice(1) + (/[.)]$/.test(m) ? '' : '.');
}

export function planIssues(d: DraftFile): Issue[] {
  const out: Issue[] = [];
  const used = roomIds(d);
  for (const rid of used) if (!d.roomNames[rid]?.trim()) out.push(err(`La habitación ${rid} no tiene nombre.`));
  for (const [rid, name] of Object.entries(d.roomNames))
    if (used.includes(rid) && name.trim() && !/^(el|la|los|las)\s/i.test(name.trim()))
      out.push(warn(`"${name}": conviene escribirlo con artículo ("la cocina", "el bar") para que las pistas se lean bien.`));
  if (used.length < 2) out.push(warn('Con una sola habitación, la regla del crimen no deja ningún culpable posible: pintá al menos dos.'));
  for (const rid of splitRooms(d)) out.push(warn(`${d.roomNames[rid] || rid} quedó partida en pedazos que no se tocan.`));
  const p = toPuzzle(d);
  const idx = [...Array(d.size).keys()];
  for (const r of idx) if (idx.every((c) => isBlocked(p, { r, c }))) out.push(err(`La fila ${r + 1} está toda bloqueada por muebles: ahí no entra nadie.`));
  for (const c of idx)
    if (idx.every((r) => isBlocked(p, { r, c }))) out.push(err(`La columna ${String.fromCharCode(65 + c)} está toda bloqueada por muebles: ahí no entra nadie.`));
  return out;
}

export function peopleIssues(d: DraftFile): Issue[] {
  const out: Issue[] = [];
  if (d.people.length !== d.size)
    out.push(err(`Hacen falta ${d.size} personas, una por fila y columna (hay ${d.people.length}).`));
  const victims = d.people.filter((x) => x.role === 'victim').length;
  if (victims !== 1) out.push(err(victims ? 'Hay más de una víctima.' : 'Falta elegir a la víctima.'));
  const names = new Map<string, number>();
  for (const x of d.people) {
    if (!x.name.trim()) out.push(err('Hay una persona sin nombre.'));
    else if (x.name.length > 30) out.push(err(`El nombre "${x.name.slice(0, 30)}…" es demasiado largo (máximo 30).`));
    names.set(x.name.trim().toLowerCase(), (names.get(x.name.trim().toLowerCase()) ?? 0) + 1);
    if (!ID.test(x.id)) out.push(err(`El identificador "${x.id}" solo puede tener minúsculas, números y guiones.`));
    if (!x.avatar.trim()) out.push(warn(`${x.name || x.id} no tiene avatar.`));
  }
  for (const [n, k] of names) if (n && k > 1) out.push(err(`Hay ${k} personas que se llaman "${n}".`));
  if (new Set(d.people.map((x) => x.id)).size !== d.people.length) out.push(err('Hay dos personas con el mismo identificador.'));
  return out;
}

/** Errores de la solución (con los del plano y las personas que la afectan) y avisos sobre pistas que dejaron de ser ciertas. */
export function solutionIssues(d: DraftFile): Issue[] {
  const p = toPuzzle(d);
  const sol = toPlacement(d.solution);
  // draftErrors corre sin pistas: las pistas viejas que dejaron de cumplirse se informan aparte.
  const bare: Puzzle = { ...p, people: p.people.map((x) => ({ ...x, clue: { rules: [] } })) };
  const placed = d.people.filter((x) => sol[x.id]);
  const clash = (axis: 'r' | 'c') =>
    [...Array(d.size).keys()]
      .map((i) => placed.filter((x) => sol[x.id][axis] === i))
      .filter((g) => g.length > 1)
      .map((g) => `${list(g.map((x) => x.name || x.id))} comparten la ${axis === 'r' ? `fila ${sol[g[0].id].r + 1}` : `columna ${String.fromCharCode(65 + sol[g[0].id].c)}`}.`);
  const clashes = [...clash('r'), ...clash('c')];
  const out = draftErrors(bare, sol).flatMap((m) =>
    // "repite fila o columna" también salta cuando falta gente: se reemplaza por quiénes chocan, si chocan.
    m === 'la solución repite fila o columna' ? clashes.map(err) : [err(humanize(d, m))],
  );
  if (!out.length) {
    const falsas = violations(p, sol);
    if (falsas.length) out.push(warn(`Con esta solución dejan de ser ciertas las pistas de ${list(falsas.map((id) => nameOf(d, id)))}.`));
    if (factViolations(p, sol).length) out.push(warn('Algún hecho general dejó de ser cierto con esta solución.'));
  }
  return out;
}

/** El culpable según la solución del autor (o null si todavía no queda uno solo). */
export function draftKiller(d: DraftFile): string | null {
  const sol = toPlacement(d.solution);
  if (d.people.some((x) => !sol[x.id])) return null;
  return killerOf(toPuzzle(d), sol);
}
