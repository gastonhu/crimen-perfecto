// Lógica del editor de casos: borradores, conversiones draft ↔ caso, estado con deshacer, backend local y un
// caso 5x5 armado de punta a punta (plano → personas → solución → pistas → exportar).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { schemaErrors } from '../../scripts/schema';
import { candidateRules, describeRule, killerOf, solve, structuralErrors, type Puzzle } from '../engine';
import * as D from './draft';
import { draftKiller, humanize, peopleIssues, planIssues, solutionIssues } from './issues';
import { createLocalBackend, memoryStorage } from './localBackend';
import { publishErrors } from './publishCheck';
import { fixedRules, reduceDoc, reduceHistory, type Action, type EditorDoc, type History } from './state';
import { analyze, generate } from './tasks';

const load = (f: string): Puzzle => JSON.parse(readFileSync(new URL(`../../puzzles/${f}`, import.meta.url), 'utf8'));

/** Aplica acciones como lo haría la UI. */
const run = (doc: EditorDoc, ...actions: Action[]) => actions.reduce(reduceDoc, doc);
const docOf = (draft: D.DraftFile): EditorDoc => ({ draft, pinned: [], seed: 1 });

/** El caso 5x5 de ejemplo: sala (A1:B2), bar (C1:E2), cocina (filas 3 a 5). */
function buildCase(): EditorDoc {
  let doc = docOf(D.newDraft(5));
  const paint = (letter: string, r0: number, r1: number, c0: number, c1: number): Action[] => {
    const out: Action[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push({ type: 'paintRoom', cell: { r, c }, letter, stroke: true });
    return out;
  };
  doc = run(
    doc,
    { type: 'renameRoom', letter: 'A', name: 'la sala' },
    { type: 'addRoom', letter: 'B', name: 'el bar' },
    { type: 'addRoom', letter: 'C', name: 'la cocina' },
    ...paint('B', 0, 1, 2, 4),
    ...paint('C', 2, 4, 0, 4),
    { type: 'setObject', cell: { r: 0, c: 0 }, code: 'C' },
    { type: 'setObject', cell: { r: 0, c: 3 }, code: 'T' },
    { type: 'setObject', cell: { r: 3, c: 1 }, code: 'P' },
    { type: 'setObject', cell: { r: 4, c: 4 }, code: 'B' },
    { type: 'toggleSide', cell: { r: 0, c: 0 }, side: 'N' },
    { type: 'toggleSide', cell: { r: 1, c: 1 }, side: 'E' },
  );
  const [v, a, b, c, d] = doc.draft.people.map((x) => x.id);
  doc = run(
    doc,
    { type: 'renamePerson', id: v, name: 'Doña Rosa' },
    { type: 'updatePerson', id: v, patch: { gender: 'f', avatar: '👒' } },
  );
  const victim = doc.draft.people[0].id;
  return run(
    doc,
    { type: 'place', id: victim, cell: { r: 0, c: 0 } },
    { type: 'place', id: a, cell: { r: 1, c: 1 } },
    { type: 'place', id: b, cell: { r: 2, c: 2 } },
    { type: 'place', id: c, cell: { r: 3, c: 3 } },
    { type: 'place', id: d, cell: { r: 4, c: 4 } },
  );
}

describe('borrador nuevo', () => {
  it('tiene NxN, una víctima y N personas', () => {
    for (const n of [3, 5, 9]) {
      const d = D.newDraft(n);
      expect(d.rooms).toHaveLength(n);
      expect(d.objects.every((row) => row.length === n)).toBe(true);
      expect(d.people).toHaveLength(n);
      expect(d.people.filter((x) => x.role === 'victim')).toHaveLength(1);
      expect(new Set(d.people.map((x) => x.id)).size).toBe(n);
      expect(peopleIssues(d)).toEqual([]);
    }
  });

  it('slug arma ids válidos', () => {
    expect(D.slug('Doña Rosa Ñandú')).toBe('dona-rosa-nandu');
    expect(D.slug('  !!  ')).toBe('persona');
  });
});

describe('plano', () => {
  it('pinta habitaciones y saca puertas que ya no separan nada', () => {
    let d = D.newDraft(3);
    d = D.addRoom(d, 'B', 'el patio');
    d = D.paintRoom(d, { r: 0, c: 1 }, 'B');
    d = D.toggleSide(d, { r: 0, c: 0 }, 'E');
    expect(d.doors).toEqual(['A1E']);
    // La misma puerta desde la otra casilla: se saca.
    expect(D.toggleSide(d, { r: 0, c: 1 }, 'O').doors).toEqual([]);
    expect(D.hasSide(d, { r: 0, c: 1 }, 'O')).toBe(true);
    // Si las dos casillas vuelven a ser de la misma habitación, la puerta sobra.
    expect(D.paintRoom(d, { r: 0, c: 1 }, 'A').doors).toEqual([]);
  });

  it('ventanas solo en paredes exteriores', () => {
    const d = D.newDraft(3);
    expect(D.sideKind(d, { r: 0, c: 0 }, 'N')).toBe('windows');
    expect(D.sideKind(d, { r: 1, c: 1 }, 'N')).toBe(null);
    expect(D.toggleSide(d, { r: 1, c: 1 }, 'N')).toBe(d);
    expect(D.toggleSide(d, { r: 2, c: 2 }, 'S').windows).toEqual(['C3S']);
  });

  it('cambiar el tamaño conserva lo que entra', () => {
    let d = buildCase().draft;
    d = D.resize(d, 4);
    expect(d.rooms).toEqual(['AABB', 'AABB', 'CCCC', 'CCCC']);
    expect(d.solution[d.people[4].id]).toBeUndefined();
    expect(structuralErrors(D.toPuzzle(d)).filter((e) => !e.includes('personas'))).toEqual([]);
    d = D.resize(d, 6);
    expect(d.rooms[5]).toBe('CCCCCC');
    expect(d.objects[5]).toBe('......');
  });

  it('borrar una habitación pasa sus casillas a otra y limpia pistas', () => {
    let d = buildCase().draft;
    const x = d.people[1].id;
    d = D.setRules(d, x, [['inRoom', 'A'], ['notInRoom', 'B']]);
    d = D.removeRoom(d, 'B', 'A');
    expect(d.rooms.join('')).not.toContain('B');
    expect(d.roomNames.B).toBeUndefined();
    expect(d.people[1].clue.rules).toEqual([['inRoom', 'A']]);
  });

  it('avisa habitaciones partidas, sin artículo y filas bloqueadas', () => {
    let d = D.newDraft(3);
    d = D.addRoom(d, 'B', 'patio');
    d = D.paintRoom(d, { r: 0, c: 0 }, 'B');
    d = D.paintRoom(d, { r: 2, c: 2 }, 'B');
    for (const c of [0, 1, 2]) d = D.setObject(d, { r: 1, c }, 'T');
    const texts = planIssues(d).map((i) => i.text);
    expect(texts.some((t) => t.includes('partida'))).toBe(true);
    expect(texts.some((t) => t.includes('artículo'))).toBe(true);
    expect(texts.some((t) => t.includes('fila 2'))).toBe(true);
  });
});

describe('personas', () => {
  it('cambiar el nombre actualiza el id y sus referencias', () => {
    let d = buildCase().draft;
    const [v, a] = d.people;
    d = D.setRules(d, a.id, [['sameRoomAs', v.id]]);
    const renamed = D.renamePersonName(d, v.id, 'Señora Pérez');
    expect(renamed.people[0].id).toBe('senora-perez');
    expect(renamed.people[1].clue.rules).toEqual([['sameRoomAs', 'senora-perez']]);
    expect(renamed.solution['senora-perez']).toEqual([1, 1]);
    expect(renamed.solution[v.id]).toBeUndefined();
  });

  it('un id editado a mano no cambia con el nombre', () => {
    let d = D.newDraft(3);
    d = D.renamePerson(d, d.people[0].id, 'jefa');
    d = D.renamePersonName(d, 'jefa', 'Marta');
    expect(d.people[0].id).toBe('jefa');
    expect(d.people[0].name).toBe('Marta');
  });

  it('una sola víctima', () => {
    let d = D.newDraft(3);
    d = D.updatePerson(d, d.people[2].id, { role: 'victim' });
    expect(d.people.map((x) => x.role)).toEqual(['suspect', 'suspect', 'victim']);
  });

  it('quitar a alguien borra las pistas que lo nombran y su lugar', () => {
    let d = buildCase().draft;
    const [v, a] = d.people;
    d = D.setRules(d, a.id, [['northOf', v.id], ['onEdge']]);
    d = D.removePerson(d, v.id);
    expect(d.people[0].clue.rules).toEqual([['onEdge']]);
    expect(d.solution[v.id]).toBeUndefined();
    expect(peopleIssues(d).some((i) => i.text.includes('víctima'))).toBe(true);
  });
});

describe('solución', () => {
  it('ubicar en una casilla ocupada desplaza a quien estaba', () => {
    let d = buildCase().draft;
    const [v, a] = d.people;
    d = D.placePerson(d, a.id, { r: 0, c: 0 });
    expect(d.solution[a.id]).toEqual([1, 1]);
    expect(d.solution[v.id]).toBeUndefined();
  });

  it('explica los errores en castellano y con nombres', () => {
    let d = buildCase().draft;
    const [v, a, b] = d.people;
    d = D.placePerson(d, b.id, { r: 0, c: 3 }); // sobre la mesa (y en la fila de la víctima)
    const texts = solutionIssues(d).map((i) => i.text);
    expect(texts).toContain('Hay dos personas en la misma fila o columna.');
    expect(texts).toContain(`${b.name} está sobre un mueble que bloquea la casilla.`);
    d = D.placePerson(buildCase().draft, a.id, null);
    expect(solutionIssues(d).map((i) => i.text)[0]).toBe(`Falta ubicar a ${a.name}.`);
    expect(humanize(d, `${v.id}: referencia a persona inexistente 'zzz'`)).toBe(`La pista de ${v.name} nombra a alguien que ya no está (zzz).`);
  });

  it('la regla del crimen', () => {
    const d = buildCase().draft;
    expect(solutionIssues(d)).toEqual([]);
    expect(draftKiller(d)).toBe(d.people[1].id);
    const touching = { ...d, crime: 'touchingVictim' as const };
    expect(draftKiller(touching)).toBe(d.people[1].id);
    // Con un tercero en la sala ya no hay culpable único.
    const crowded = D.placePerson(D.placePerson(d, d.people[2].id, { r: 1, c: 0 }), d.people[1].id, { r: 2, c: 1 });
    expect(solutionIssues(crowded).some((i) => i.level === 'error')).toBe(true);
  });
});

describe('caso 5x5 de punta a punta', () => {
  it('plano → personas → solución → pistas → exportar', () => {
    let doc = buildCase();
    expect(planIssues(doc.draft).filter((i) => i.level === 'error')).toEqual([]);
    expect(peopleIssues(doc.draft)).toEqual([]);
    expect(solutionIssues(doc.draft)).toEqual([]);

    // El autor fija una pista propia elegida de las candidatas.
    const victim = doc.draft.people[0];
    const sol = D.toPlacement(doc.draft.solution);
    const chair = candidateRules(D.toPuzzle(doc.draft), sol, victim.id).find((c) => c.rule[0] === 'onObject')!.rule;
    expect(describeRule(D.toPuzzle(doc.draft), chair)).toBe('estaba en una silla');
    doc = run(doc, { type: 'addRule', id: victim.id, rule: chair }, { type: 'togglePin', id: victim.id, rule: chair });
    expect(fixedRules(doc)).toEqual({ [victim.id]: [chair] });

    const progress: string[] = [];
    const { puzzle } = generate(
      { kind: 'generate', puzzle: D.toPuzzle(doc.draft), solution: sol, seed: 3, prune: true, fixed: fixedRules(doc) },
      (p) => progress.push(p.text),
    );
    expect(progress.length).toBeGreaterThan(0);
    doc = run(doc, { type: 'applyClues', puzzle, seed: 3 });
    expect(doc.draft.people[0].clue.rules).toContainEqual(chair);
    expect(doc.pinned).toHaveLength(1);

    // Un hecho general y un texto propio.
    doc = run(
      doc,
      { type: 'addFact', fact: D.factFor(doc.draft, 'roomCount', 'B') },
      { type: 'setClueText', id: victim.id, text: 'Dice que estaba sentada.' },
      {
        type: 'setMeta',
        patch: { id: 'prueba-01', theme: 'hotel', title: 'Caso de prueba', story: 'Una historia de prueba bastante larga.', epilogue: 'Fue {killer}.' },
      },
    );
    expect(doc.draft.facts).toEqual([{ fact: ['roomCount', 'B', 0] }]);

    const a = analyze({ kind: 'analyze', puzzle: D.toPuzzle(doc.draft), solution: sol });
    expect(a.solutions).toBe(1);
    expect(a.matchesAuthor).toBe(true);
    expect(a.killer).toBe(doc.draft.people[1].id);
    expect(a.difficulty!.level).toBeGreaterThanOrEqual(1);
    expect(a.steps.length).toBeGreaterThan(0);

    const caso = D.publishedCase(doc.draft, a.difficulty!.level);
    expect('solution' in caso).toBe(false);
    expect(caso.schemaVersion).toBe(2);
    expect(caso.difficulty).toBe(a.difficulty!.level);
    expect(schemaErrors(JSON.parse(D.toJson(caso)))).toEqual([]);
    expect(publishErrors(caso, doc.draft.solution)).toEqual([]);
    const sols = solve(caso, { limit: 2 });
    expect(sols).toHaveLength(1);
    expect(killerOf(caso, sols[0])).toBe(doc.draft.people[1].id);

    // El borrador exportado vuelve a entrar igual; el caso publicado reconstruye la solución.
    const file = D.draftFile(doc.draft, a.difficulty!.level);
    expect(D.parseImport(D.toJson(file)).draft.solution).toEqual(doc.draft.solution);
    expect(D.parseImport(D.toJson(file)).warnings).toEqual([]);
    const fromCase = D.parseImport(D.toJson(caso));
    expect(fromCase.draft.solution).toEqual(doc.draft.solution);
    expect(fromCase.warnings[0]).toMatch(/reconstruí/);
  });

  it('el caso exportado de un publicado real es idéntico al original', () => {
    for (const f of ['hotel/hotel-01.json', 'tren/tren-01.json', 'datacenter/datacenter-01.json']) {
      const p = load(f);
      const { draft } = D.parseImport(JSON.stringify(p));
      expect(D.publishedCase(draft)).toEqual(p);
    }
  });
});

describe('importar', () => {
  it('rechaza JSON roto o planos mal formados con mensajes claros', () => {
    expect(() => D.parseImport('{')).toThrow('No es un JSON válido.');
    expect(() => D.parseImport('{"size": 12}')).toThrow(/size/);
    expect(() => D.parseImport('{"size": 3, "rooms": ["AA"], "objects": []}')).toThrow(/rooms/);
  });

  it('acepta un borrador sin pistas (como drafts/*.json)', () => {
    const d = D.newDraft(3);
    const raw = { ...d, people: d.people.map(({ clue: _c, ...x }) => x), solution: { [d.people[0].id]: [1, 1] } };
    const r = D.parseImport(JSON.stringify(raw));
    expect(r.draft.people.every((x) => x.clue.rules.length === 0)).toBe(true);
    expect(r.draft.solution).toEqual({ [d.people[0].id]: [1, 1] });
    expect(r.warnings[0]).toMatch(/no ubica/);
  });
});

describe('estado con deshacer', () => {
  const start = (): History => ({ past: [], present: buildCase(), future: [] });

  it('deshace y rehace', () => {
    let h = start();
    h = reduceHistory(h, { type: 'setObject', cell: { r: 1, c: 0 }, code: 'S' });
    expect(h.present.draft.objects[1][0]).toBe('S');
    h = reduceHistory(h, { type: 'undo' });
    expect(h.present.draft.objects[1][0]).toBe('.');
    h = reduceHistory(h, { type: 'redo' });
    expect(h.present.draft.objects[1][0]).toBe('S');
  });

  it('un trazo de pincel y un texto tipeado son un solo paso', () => {
    let h = start();
    h = reduceHistory(h, { type: 'paintRoom', cell: { r: 2, c: 0 }, letter: 'A' });
    h = reduceHistory(h, { type: 'paintRoom', cell: { r: 2, c: 1 }, letter: 'A', stroke: true });
    h = reduceHistory(h, { type: 'paintRoom', cell: { r: 2, c: 2 }, letter: 'A', stroke: true });
    expect(h.past).toHaveLength(1);
    h = reduceHistory(h, { type: 'setMeta', patch: { title: 'C' } });
    h = reduceHistory(h, { type: 'setMeta', patch: { title: 'Ca' } });
    h = reduceHistory(h, { type: 'setMeta', patch: { title: 'Cas' } });
    expect(h.past).toHaveLength(2);
    h = reduceHistory(h, { type: 'undo' });
    expect(h.present.draft.title).toBe('');
  });

  it('acciones sin efecto no suman pasos', () => {
    let h = start();
    h = reduceHistory(h, { type: 'paintRoom', cell: { r: 0, c: 0 }, letter: 'A' });
    expect(h.past).toHaveLength(0);
  });

  it('las reglas fijadas siguen a la persona si cambia su id', () => {
    let doc = buildCase();
    const [v, a] = doc.draft.people;
    doc = run(doc, { type: 'addRule', id: a.id, rule: ['sameRoomAs', v.id] }, { type: 'togglePin', id: a.id, rule: ['sameRoomAs', v.id] });
    doc = run(doc, { type: 'setPersonId', id: v.id, to: 'rosa' });
    expect(fixedRules(doc)).toEqual({ [a.id]: [['sameRoomAs', 'rosa']] });
    doc = run(doc, { type: 'removeRule', id: a.id, index: 0 });
    expect(doc.pinned).toEqual([]);
  });
});

describe('backend local', () => {
  it('ingreso de autor, borradores y publicados', async () => {
    const be = createLocalBackend(memoryStorage());
    expect(await be.currentAuthor()).toBe(null);
    await expect(be.signIn('', 'x')).rejects.toThrow('Completá');
    await be.signIn(' autora@ejemplo.com ', 'secreto');
    expect(await be.currentAuthor()).toEqual({ email: 'autora@ejemplo.com' });

    const doc = buildCase();
    await be.saveDraft({ key: 'k1', updatedAt: 0, draft: doc.draft, pinned: [] });
    const list = await be.listDrafts();
    expect(list).toHaveLength(1);
    expect(list[0].key).toBe('k1');
    expect((await be.loadDraft('k1'))!.draft).toEqual(doc.draft);

    // Publicar un caso sin pistas falla con un mensaje en castellano.
    await expect(be.publish(D.publishedCase(doc.draft), doc.draft.solution)).rejects.toThrow(/No se puede publicar/);

    const hotel = load('hotel/hotel-01.json');
    const sol = D.fromPlacement(solve(hotel, { limit: 1 })[0]);
    const r = await be.publish(hotel, sol);
    expect(r.id).toBe('hotel-01');
    expect(r.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect((await be.listPublished()).map((x) => x.id)).toEqual(['hotel-01']);
    expect((await be.loadPublished('hotel-01'))!.solution).toEqual(sol);
    // Con otra solución no se publica.
    const wrong = { ...sol, [hotel.people[0].id]: [9, 9] as [number, number] };
    await expect(be.publish(hotel, wrong)).rejects.toThrow(/no es la que elegiste/);
    await be.unpublish('hotel-01');
    expect(await be.listPublished()).toEqual([]);
    await expect(be.unpublish('hotel-01')).rejects.toThrow(/No hay/);

    await be.deleteDraft('k1');
    expect(await be.listDrafts()).toEqual([]);
    await be.signOut();
    expect(await be.currentAuthor()).toBe(null);
  });

  it('sigue andando si el almacenamiento falla', async () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('lleno');
      },
      removeItem: () => {},
    };
    const be = createLocalBackend(broken);
    expect(await be.listDrafts()).toEqual([]);
    await expect(be.saveDraft({ key: 'x', updatedAt: 0, draft: D.newDraft(3) })).rejects.toThrow(/almacenamiento/);
  });
});
