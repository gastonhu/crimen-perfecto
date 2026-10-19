// Verificación final antes de publicar: el mismo criterio que `npm run validate` (formato v2, estructura,
// solución única, un solo culpable) más que la solución coincida con la del autor.
import { fileFormatErrors, killerOf, solve, structuralErrors, type Puzzle } from '../engine';
import { toPlacement, type RawSolution } from './draft';

const FIELD: Record<string, string> = {
  id: 'Identificador',
  theme: 'Tema',
  title: 'Título',
  story: 'Historia',
  epilogue: 'Epílogo',
  difficulty: 'Dificultad',
};

/** Errores que impiden publicar, en castellano (vacío si se puede). Puede tardar en planos grandes. */
export function publishErrors(caso: Puzzle, solucion: RawSolution): string[] {
  const shape = fileFormatErrors(caso).map((e) => {
    const [path, ...rest] = e.split(': ');
    return FIELD[path] ? `${FIELD[path]}: ${rest.join(': ')}` : e;
  });
  if (shape.length) return shape;
  const errs = structuralErrors(caso);
  if (errs.length) return errs;
  const sols = solve(caso, { limit: 2 });
  if (!sols.length) return ['Las pistas no tienen solución.'];
  if (sols.length > 1) return ['Las pistas admiten más de una solución.'];
  if (!killerOf(caso, sols[0])) return ['La solución no deja un único culpable.'];
  const mine = toPlacement(solucion);
  if (caso.people.some((x) => !mine[x.id] || mine[x.id].r !== sols[0][x.id].r || mine[x.id].c !== sols[0][x.id].c))
    return ['La solución de las pistas no es la que elegiste.'];
  return [];
}
