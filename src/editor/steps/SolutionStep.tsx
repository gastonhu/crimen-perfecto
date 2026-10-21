// Paso 3: dónde estaba cada persona (la solución) y la regla del crimen, con validación en vivo.
import { useMemo, useState } from 'react';
import { cellKey, diagonals, roomAt, type Cell, type CrimeRule } from '../../engine';
import { BoardView } from '../../ui/BoardView';
import { boardOf, boardPuzzle, cellName, crossedBy, IssueList, type StepProps } from '../common';
import { toPlacement } from '../draft';
import { draftKiller, type Issue } from '../issues';
import { Monogram } from '../../ui/Icon';
import { initials } from '../../ui/initials';

const CRIMES: { id: CrimeRule; label: string; help: string }[] = [
  { id: 'aloneWithVictim', label: 'A solas con la víctima', help: 'El culpable es el único sospechoso en la habitación de la víctima.' },
  { id: 'touchingVictim', label: 'Pegado en diagonal', help: 'El culpable es la única persona tocando a la víctima por una esquina.' },
];

export function SolutionStep({ doc, dispatch, issues }: StepProps & { issues: Issue[] }) {
  const d = doc.draft;
  const short = initials(d.people.map((x) => ({ ...x, name: x.name || x.id })));
  const p = useMemo(() => boardPuzzle(d), [d]);
  const board = useMemo(() => boardOf(d), [d]);
  const sol = useMemo(() => toPlacement(d.solution), [d.solution]);
  const [selected, setSelected] = useState<string | null>(() => d.people.find((x) => !d.solution[x.id])?.id ?? d.people[0]?.id ?? null);
  const crime = d.crime ?? 'aloneWithVictim';
  const killer = issues.some((i) => i.level === 'error') ? null : draftKiller(d);
  const killerName = d.people.find((x) => x.id === killer)?.name;
  const victim = d.people.find((x) => x.role === 'victim');

  // Escena del crimen iluminada cuando la solución ya deja un culpable.
  const scene = useMemo(() => {
    if (!killer || !victim) return null;
    const v = sol[victim.id];
    if (crime === 'touchingVictim') return new Set([v, ...diagonals(p, v)].map(cellKey));
    const rid = roomAt(p, v);
    const out = new Set<string>();
    for (let r = 0; r < d.size; r++) for (let c = 0; c < d.size; c++) if (d.rooms[r][c] === rid) out.add(`${r},${c}`);
    return out;
  }, [killer, victim, sol, crime, p, d.size, d.rooms]);

  const onCell = (cell: Cell) => {
    const occupant = d.people.find((x) => sol[x.id] && cellKey(sol[x.id]) === cellKey(cell));
    if (occupant && occupant.id !== selected) return setSelected(occupant.id);
    if (!selected) return;
    if (occupant?.id === selected) return dispatch({ type: 'place', id: selected, cell: null });
    dispatch({ type: 'place', id: selected, cell });
    const next = d.people.find((x) => x.id !== selected && !d.solution[x.id]);
    if (next && !d.solution[selected]) setSelected(next.id);
  };

  return (
    <div className="ed-step ed-solution">
      <div className="ed-board-col">
        <p className="note ed-tip">Elegí a una persona y tocá su casilla. Tocándola de nuevo la sacás; también podés arrastrar las fichas.</p>
        <BoardView
          puzzle={p}
          board={board}
          bad={new Set()}
          highlight={new Set()}
          focusCells={scene}
          crossed={scene ? undefined : crossedBy(board.placements, d.size)}
          selected={selected}
          onCell={onCell}
          onDrop={(id, cell) => dispatch({ type: 'place', id, cell })}
        />
        {killerName && (
          <p className="msg ed-killer" role="status">
            Culpable: <strong>{killerName}</strong>
            {crime === 'aloneWithVictim' ? ', a solas con ' : ', en diagonal a '}
            {victim?.name}.
          </p>
        )}
        <IssueList issues={issues} ok="La solución es válida." />
      </div>
      <div className="ed-side-col">
        <fieldset className="ed-panel-box ed-crime">
          <legend className="eyebrow">Regla del crimen</legend>
          {CRIMES.map((c) => (
            <label key={c.id} className="ed-check ed-radio-card">
              <input type="radio" name="ed-crime" checked={crime === c.id} onChange={() => dispatch({ type: 'setCrime', crime: c.id })} />
              <span>
                <strong>{c.label}</strong>
                <small>{c.help}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <ol className="people">
          {d.people.map((x) => {
            const at = sol[x.id];
            return (
              <li key={x.id} className={['person', x.role, selected === x.id && 'selected', at && 'placed'].filter(Boolean).join(' ')}>
                <button onClick={() => setSelected(x.id)} aria-pressed={selected === x.id}>
                  <Monogram person={x} text={short.get(x.id) ?? ''} />
                  <span className="who">
                    <span className="name">
                      {x.name || x.id}
                      {x.role === 'victim' && <span className="tag danger">Víctima</span>}
                      {x.id === killer && <span className="chip danger">Culpable</span>}
                    </span>
                    <span className={`chip ${at ? 'success' : ''}`}>{at ? `En ${cellName(at)} · ${d.roomNames[d.rooms[at.r][at.c]] ?? ''}` : 'Sin ubicar'}</span>
                  </span>
                </button>
                {at && (
                  <div className="person-actions">
                    <button className="ghost remove" onClick={() => dispatch({ type: 'place', id: x.id, cell: null })} aria-label={`Sacar a ${x.name} del plano`}>
                      ×
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <button className="ghost" onClick={() => dispatch({ type: 'clearSolution' })} disabled={!Object.keys(d.solution).length}>
          Sacar a todos del plano
        </button>
      </div>
    </div>
  );
}
