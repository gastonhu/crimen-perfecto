import { useMemo, useState } from 'react';
import { cellKey, clueText, colLabel, unaryDomain, type Cell, type Puzzle } from '../../engine';
import { BoardView } from '../BoardView';
import { clueRefs } from '../clueRefs';
import type { Board } from '../useGame';

/** Caso de práctica 3x3 (no se publica ni suma puntos). */
export const TUTORIAL: Puzzle = {
  schemaVersion: 2,
  id: 'tutorial',
  theme: 'tutorial',
  title: 'Primer día en la agencia',
  size: 3,
  difficulty: 1,
  story: 'Un caso de práctica para aprender a leer el plano.',
  rooms: ['AAB', 'AAB', 'CCB'],
  roomNames: { A: 'la sala', B: 'el balcón', C: 'el pasillo' },
  objects: ['C..', '...', '...'],
  people: [
    { id: 'vera', name: 'Vera', role: 'victim', avatar: '🎻', gender: 'f', clue: { rules: [['onObject', 'C']] } },
    { id: 'xavi', name: 'Xavi', role: 'suspect', avatar: '🧥', gender: 'm', clue: { rules: [['inRoom', 'A']] } },
    { id: 'yael', name: 'Yael', role: 'suspect', avatar: '🌂', gender: 'f', clue: { rules: [['inRoom', 'B']] } },
  ],
};

interface StepDef {
  text: string;
  expect?: { personId: string; cell: Cell };
  accuse?: boolean;
}

const STEPS: StepDef[] = [
  {
    text: 'Cada caso es un plano dividido en habitaciones. Hay que ubicar a cada persona en una casilla: una sola por fila y una sola por columna. Las pistas dicen dónde estaba cada una.',
  },
  {
    text: 'Vera, la víctima, estaba en una silla, y en el plano hay una sola: la de A1. Las casillas iluminadas son las que cumplen la pista de quien elegiste (en los casos lo ves pasando el mouse por una pista o tocando 👁). Elegí a Vera en la lista y tocá A1.',
    expect: { personId: 'vera', cell: { r: 0, c: 0 } },
  },
  {
    text: 'Vera ocupa la fila 1 y la columna A: ahí ya no entra nadie más, por eso quedan tachadas. Xavi estaba en la sala. ¿Qué casilla de la sala queda libre? Elegí a Xavi y ubicalo.',
    expect: { personId: 'xavi', cell: { r: 1, c: 1 } },
  },
  {
    text: 'Yael estaba en el balcón. Con las filas y columnas que ya están ocupadas, hay un solo lugar posible.',
    expect: { personId: 'yael', cell: { r: 2, c: 2 } },
  },
  {
    text: 'Todos ubicados. El asesino es el único sospechoso que quedó a solas con la víctima en su habitación. ¿Quién estaba con Vera en la sala?',
    accuse: true,
  },
];

export function Tutorial({ onDone }: { onDone: () => void }) {
  const p = TUTORIAL;
  const [step, setStep] = useState(0);
  const [board, setBoard] = useState<Board>({ placements: {}, marks: [], notes: {} });
  const [selected, setSelected] = useState<string | null>('vera');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const current = STEPS[step];

  // Guía visual: dónde puede ir quien está elegido y qué filas/columnas ya están ocupadas.
  const guide = current?.expect && selected ? p.people.find((x) => x.id === selected) : null;
  const focusCells = useMemo(() => (guide ? new Set(unaryDomain(p, guide).map(cellKey)) : null), [guide, p]);
  const refCells = guide ? clueRefs(p, guide, board.placements).cells : undefined;
  const crossed = useMemo(() => {
    const set = new Set<string>();
    for (const c of Object.values(board.placements))
      if (c)
        for (let i = 0; i < p.size; i++) {
          set.add(`${c.r},${i}`);
          set.add(`${i},${c.c}`);
        }
    return set;
  }, [board.placements, p.size]);

  const place = (personId: string, cell: Cell) => {
    const exp = current.expect;
    if (!exp) return;
    if (personId !== exp.personId) return setFeedback(`Ahora toca ubicar a ${p.people.find((x) => x.id === exp.personId)!.name}.`);
    if (cellKey(cell) !== cellKey(exp.cell)) return setFeedback(`${colLabel(cell.c)}${cell.r + 1} no cumple: mirá de nuevo la pista y las filas ocupadas.`);
    setBoard((b) => ({ ...b, placements: { ...b.placements, [personId]: cell } }));
    setFeedback(null);
    const next = STEPS[step + 1]?.expect?.personId ?? null;
    setSelected(next);
    setStep(step + 1);
  };

  return (
    <section className="tutorial">
      <header className="game-head">
        <button className="ghost back" onClick={onDone}>
          ← Salir
        </button>
        <div className="title">
          <span className="eyebrow">
            Tutorial · paso {Math.min(step + 1, STEPS.length)} de {STEPS.length}
          </span>
          <h2>{p.title}</h2>
        </div>
      </header>

      <div className="tutorial-step card" role="status">
        {finished ? (
          <>
            <p>
              <strong>¡Exacto, fue Xavi!</strong> Ya sabés lo básico. En los casos de verdad las pistas son más
              enredadas, y si te trabás podés pedir una ayuda que te explica el razonamiento paso a paso.
            </p>
            <div className="row">
              <button className="primary accent" onClick={onDone}>
                Ir a los casos
              </button>
            </div>
          </>
        ) : (
          <>
            <p>{current.text}</p>
            {feedback && <p className="error">{feedback}</p>}
            {!current.expect && !current.accuse && (
              <div className="row">
                <button className="primary accent" onClick={() => setStep(step + 1)}>
                  Siguiente
                </button>
              </div>
            )}
            {current.accuse && (
              <div className="row">
                {p.people
                  .filter((x) => x.role === 'suspect')
                  .map((x) => (
                    <button
                      key={x.id}
                      onClick={() => (x.id === 'xavi' ? setFinished(true) : setFeedback(`${x.name} no estaba en la sala con Vera.`))}
                    >
                      <span className="avatar">{x.avatar}</span> {x.name}
                    </button>
                  ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="game-body">
        <BoardView
          puzzle={p}
          board={board}
          bad={new Set()}
          highlight={new Set<string>()}
          focusCells={focusCells}
          refCells={refCells}
          crossed={crossed}
          selected={selected}
          onCell={(cell) => selected && place(selected, cell)}
          onDrop={place}
          locked={!current?.expect}
        />
        <ol className="people">
          {p.people.map((x) => (
            <li key={x.id} className={['person', x.role, selected === x.id && 'selected', board.placements[x.id] && 'placed'].filter(Boolean).join(' ')}>
              <button onClick={() => setSelected(x.id)} aria-pressed={selected === x.id}>
                <span className="avatar">{x.avatar}</span>
                <span className="who">
                  <span className="name">
                    {x.name}
                    {x.role === 'victim' && <span className="tag danger">Víctima</span>}
                  </span>
                  <span className="clue">{clueText(p, x)}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
