// Estado del editor: el borrador más lo que no va en el archivo (reglas fijadas, semilla), con deshacer/rehacer.
import type { Cell, CrimeRule, Fact, ObjectCode, Person, Puzzle, Rule, Side } from '../engine';
import * as D from './draft';
import type { DraftFile } from './draft';

export interface EditorDoc {
  draft: DraftFile;
  /** Reglas fijadas para la generación, como `ruleKey(persona, regla)`. */
  pinned: string[];
  seed: number;
}

export type Action =
  | { type: 'replace'; doc: EditorDoc }
  | { type: 'resize'; size: number }
  | { type: 'paintRoom'; cell: Cell; letter: string; stroke?: boolean }
  | { type: 'setObject'; cell: Cell; code: ObjectCode; stroke?: boolean }
  | { type: 'toggleSide'; cell: Cell; side: Side }
  | { type: 'addRoom'; letter: string; name: string }
  | { type: 'renameRoom'; letter: string; name: string }
  | { type: 'removeRoom'; letter: string; into: string }
  | { type: 'addPerson' }
  | { type: 'removePerson'; id: string }
  | { type: 'movePerson'; id: string; delta: -1 | 1 }
  | { type: 'updatePerson'; id: string; patch: Partial<Omit<Person, 'id' | 'clue'>> }
  | { type: 'renamePerson'; id: string; name: string }
  | { type: 'setPersonId'; id: string; to: string }
  | { type: 'place'; id: string; cell: Cell | null }
  | { type: 'clearSolution' }
  | { type: 'setCrime'; crime: CrimeRule }
  | { type: 'addRule'; id: string; rule: Rule }
  | { type: 'removeRule'; id: string; index: number }
  | { type: 'togglePin'; id: string; rule: Rule }
  | { type: 'setClueText'; id: string; text: string }
  | { type: 'applyClues'; puzzle: Puzzle; seed: number }
  | { type: 'clearClues' }
  | { type: 'addFact'; fact: Fact }
  | { type: 'removeFact'; index: number }
  | { type: 'setFactText'; index: number; text: string }
  | { type: 'setMeta'; patch: Partial<Pick<DraftFile, 'id' | 'theme' | 'title' | 'story' | 'epilogue' | 'difficulty'>> };

const withDraft = (doc: EditorDoc, draft: DraftFile): EditorDoc => (draft === doc.draft ? doc : { ...doc, draft });

/** Las reglas fijadas que siguen existiendo (si se borra una regla o una persona, su fijación se va). */
function keepPins(doc: EditorDoc): EditorDoc {
  const live = new Set(doc.draft.people.flatMap((x) => x.clue.rules.map((r) => D.ruleKey(x.id, r))));
  const pinned = doc.pinned.filter((k) => live.has(k));
  return pinned.length === doc.pinned.length ? doc : { ...doc, pinned };
}

export function reduceDoc(doc: EditorDoc, a: Action): EditorDoc {
  const d = doc.draft;
  switch (a.type) {
    case 'replace':
      return a.doc;
    case 'resize':
      return keepPins(withDraft(doc, D.resize(d, a.size)));
    case 'paintRoom':
      return withDraft(doc, D.paintRoom(d, a.cell, a.letter));
    case 'setObject':
      return withDraft(doc, D.setObject(d, a.cell, a.code));
    case 'toggleSide':
      return withDraft(doc, D.toggleSide(d, a.cell, a.side));
    case 'addRoom':
      return withDraft(doc, D.addRoom(d, a.letter, a.name));
    case 'renameRoom':
      return withDraft(doc, D.renameRoom(d, a.letter, a.name));
    case 'removeRoom':
      return keepPins(withDraft(doc, D.removeRoom(d, a.letter, a.into)));
    case 'addPerson':
      return withDraft(doc, D.addPerson(d));
    case 'removePerson':
      return keepPins(withDraft(doc, D.removePerson(d, a.id)));
    case 'movePerson':
      return withDraft(doc, D.movePerson(d, a.id, a.delta));
    case 'updatePerson':
      return withDraft(doc, D.updatePerson(d, a.id, a.patch));
    case 'renamePerson':
    case 'setPersonId': {
      const next = a.type === 'renamePerson' ? D.renamePersonName(d, a.id, a.name) : D.renamePerson(d, a.id, a.to);
      if (next === d) return doc;
      // Las reglas fijadas siguen a la persona (y a las referencias a ella).
      const before = d.people.map((x) => x.id);
      const after = next.people.map((x) => x.id);
      const from = before.find((id) => !after.includes(id));
      const to = after.find((id) => !before.includes(id));
      if (!from || !to) return withDraft(doc, next);
      const pinned = doc.pinned.map((k) => {
        const [pid, json] = [k.slice(0, k.indexOf('|')), k.slice(k.indexOf('|') + 1)];
        const rule = JSON.parse(json) as Rule;
        const moved = rule[1] === from ? ([rule[0], to] as Rule) : rule;
        return D.ruleKey(pid === from ? to : pid, moved);
      });
      return keepPins({ ...doc, draft: next, pinned });
    }
    case 'place':
      return withDraft(doc, D.placePerson(d, a.id, a.cell));
    case 'clearSolution':
      return Object.keys(d.solution).length ? withDraft(doc, { ...d, solution: {} }) : doc;
    case 'setCrime':
      return (d.crime ?? 'aloneWithVictim') === a.crime ? doc : withDraft(doc, { ...d, crime: a.crime });
    case 'addRule': {
      const x = d.people.find((o) => o.id === a.id);
      if (!x || x.clue.rules.some((r) => JSON.stringify(r) === JSON.stringify(a.rule))) return doc;
      return withDraft(doc, D.setRules(d, a.id, [...x.clue.rules, a.rule]));
    }
    case 'removeRule': {
      const x = d.people.find((o) => o.id === a.id);
      if (!x || !x.clue.rules[a.index]) return doc;
      return keepPins(withDraft(doc, D.setRules(d, a.id, x.clue.rules.filter((_, i) => i !== a.index))));
    }
    case 'togglePin': {
      const k = D.ruleKey(a.id, a.rule);
      return { ...doc, pinned: doc.pinned.includes(k) ? doc.pinned.filter((p) => p !== k) : [...doc.pinned, k] };
    }
    case 'setClueText':
      return withDraft(doc, D.setClueText(d, a.id, a.text));
    case 'applyClues':
      return keepPins({ ...doc, draft: D.applyClues(d, a.puzzle), seed: a.seed });
    case 'clearClues':
      return keepPins(withDraft(doc, { ...d, people: d.people.map((x) => ({ ...x, clue: { rules: [] } })) }));
    case 'addFact':
      return withDraft(doc, D.addFact(d, a.fact));
    case 'removeFact':
      return withDraft(doc, D.removeFact(d, a.index));
    case 'setFactText':
      return withDraft(doc, D.setFactText(d, a.index, a.text));
    case 'setMeta':
      return withDraft(doc, { ...d, ...a.patch });
  }
}

/** Reglas fijadas por persona, para pasarle a generateClues. */
export function fixedRules(doc: EditorDoc): Record<string, Rule[]> {
  const out: Record<string, Rule[]> = {};
  for (const x of doc.draft.people) {
    const rules = x.clue.rules.filter((r) => doc.pinned.includes(D.ruleKey(x.id, r)));
    if (rules.length) out[x.id] = rules;
  }
  return out;
}

// ---------- Deshacer / rehacer ----------

export interface History {
  past: EditorDoc[];
  present: EditorDoc;
  future: EditorDoc[];
  /** Último campo de texto editado (para agrupar lo que se tipea seguido). */
  typing?: string | null;
}

export type HistoryAction = Action | { type: 'undo' } | { type: 'redo' } | { type: 'load'; doc: EditorDoc };

const LIMIT = 200;
/** Ediciones de texto seguidas sobre el mismo campo se agrupan en un solo paso de deshacer. */
const TYPING = new Set(['renameRoom', 'renamePerson', 'updatePerson', 'setClueText', 'setFactText', 'setMeta']);

const typingKey = (a: Action) => {
  if (!TYPING.has(a.type)) return null;
  const { type, ...rest } = a as Action & Record<string, unknown>;
  const fields = 'patch' in rest ? Object.keys(rest.patch as object).join(',') : '';
  return `${type}:${String(rest.id ?? rest.letter ?? rest.index ?? '')}:${fields}`;
};

export function reduceHistory(h: History, a: HistoryAction): History {
  if (a.type === 'load') return { past: [], present: a.doc, future: [] };
  if (a.type === 'undo') {
    if (!h.past.length) return h;
    return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
  }
  if (a.type === 'redo') {
    if (!h.future.length) return h;
    return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
  }
  const next = reduceDoc(h.present, a);
  if (next === h.present) return h;
  const key = typingKey(a);
  // La continuación de un trazo de pincel o de un texto reemplaza el estado sin sumar un paso.
  const merge = ('stroke' in a && a.stroke) || (key !== null && key === h.typing);
  if (merge && h.past.length) return { ...h, present: next, future: [], typing: key };
  return { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [], typing: key };
}
