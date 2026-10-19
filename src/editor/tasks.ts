// Cálculos pesados del editor. Son funciones puras: el worker las corre fuera del hilo de la UI y los tests las
// llaman directo.
import {
  TECHNIQUE_NAME,
  countSolutions,
  deduce,
  describeClue,
  difficultyOf,
  generateClues,
  killerOf,
  solve,
  structuralErrors,
  type DifficultyReport,
  type Placement,
  type Puzzle,
  type Rule,
  type Technique,
} from '../engine';

/** Tope de soluciones a contar: alcanza para decir "hay muchas". */
export const SOLUTION_CAP = 50;

export interface AnalyzeRequest {
  kind: 'analyze';
  puzzle: Puzzle;
  solution: Placement;
}

export interface GenerateRequest {
  kind: 'generate';
  puzzle: Puzzle;
  solution: Placement;
  seed: number;
  prune: boolean;
  fixed: Record<string, Rule[]>;
}

export type TaskRequest = AnalyzeRequest | GenerateRequest;

export interface DeductionStep {
  technique: Technique;
  name: string;
  level: number;
  reason: string;
  focus: { r: number; c: number }[];
}

export interface Analysis {
  /** Cantidad de soluciones de las pistas (hasta SOLUTION_CAP). */
  solutions: number;
  capped: boolean;
  /** La única solución coincide con la que eligió el autor. */
  matchesAuthor: boolean;
  /** Culpable de la única solución. */
  killer: string | null;
  difficulty: DifficultyReport | null;
  steps: DeductionStep[];
  /** Explicación de una contradicción (pistas incompatibles). */
  contradiction: string | null;
  ms: number;
}

export interface GenerateResult {
  puzzle: Puzzle;
  ms: number;
}

export interface Progress {
  text: string;
  /** Soluciones que quedan (≥300 = muchas). */
  solutions?: number;
}

const same = (a: Placement, b: Placement) => Object.keys(b).every((id) => a[id] && a[id].r === b[id].r && a[id].c === b[id].c);

export function analyze({ puzzle: p, solution }: AnalyzeRequest): Analysis {
  const t0 = performance.now();
  const errs = structuralErrors(p);
  if (errs.length) throw new Error(errs.join('; '));
  const n = countSolutions(p, SOLUTION_CAP);
  const base: Analysis = {
    solutions: n,
    capped: n >= SOLUTION_CAP,
    matchesAuthor: false,
    killer: null,
    difficulty: null,
    steps: [],
    contradiction: null,
    ms: 0,
  };
  if (n === 1) {
    const sol = solve(p, { limit: 1 })[0];
    const r = deduce(p);
    Object.assign(base, {
      matchesAuthor: same(sol, solution),
      killer: killerOf(p, sol),
      difficulty: difficultyOf(r),
      steps: r.steps.map((s) => ({ technique: s.technique, name: TECHNIQUE_NAME[s.technique], level: s.level, reason: s.reason, focus: s.focus })),
      contradiction: r.contradiction,
    });
  }
  base.ms = Math.round(performance.now() - t0);
  return base;
}

export function generate(req: GenerateRequest, onProgress: (p: Progress) => void = () => {}): GenerateResult {
  const t0 = performance.now();
  const { puzzle, solution, seed, prune, fixed } = req;
  const name = (id: string) => puzzle.people.find((x) => x.id === id)?.name ?? id;
  onProgress({ text: 'Buscando pistas…' });
  const out = generateClues(puzzle, solution, {
    seed,
    prune,
    fixed,
    onStep: (id, rule, solutions) =>
      onProgress({ text: `${name(id)}: ${describeClue(puzzle, [rule])}`, solutions }),
  });
  return { puzzle: out, ms: Math.round(performance.now() - t0) };
}
