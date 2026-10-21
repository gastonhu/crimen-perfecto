import { useState } from 'react';
import { TECHNIQUE_NAME, colLabel, type Cell, type Explanation, type Puzzle } from '../engine';

interface Props {
  puzzle: Puzzle;
  hint: Explanation;
  /** La ayuda no se cobró (el error ya estaba marcado en el plano). */
  free?: boolean;
  /** Resalta en el plano las casillas del paso que se está mostrando. */
  onFocus: (cells: Cell[]) => void;
  onApply: (personId: string, cell: Cell) => void;
  onClose: () => void;
}

const label = (c: Cell) => `${colLabel(c.c)}${c.r + 1}`;

/** Muestra la deducción de a un paso, para que el jugador pueda cortar apenas lo entienda. */
export function HintPanel({ puzzle: p, hint, free, onFocus, onApply, onClose }: Props) {
  const [shown, setShown] = useState(1);
  const name = (id: string) => p.people.find((x) => x.id === id)?.name ?? id;

  let body: React.ReactNode;
  if (hint.kind === 'wrong') {
    body = (
      <p>
        Algo no cuadra con {name(hint.personId)}. Revisá su ubicación contra su pista y las de los demás.
        {free && ' Como ya estaba marcado en rojo, esta ayuda no se cuenta.'}
      </p>
    );
  } else if (hint.kind === 'none') {
    body = <p>Ya ubicaste a todos: es hora de acusar.</p>;
  } else if (hint.kind === 'reveal') {
    body = (
      <>
        <p>
          Desde acá la deducción pide probar combinaciones. Para destrabarte: {name(hint.personId)} va en {label(hint.cell)}.
        </p>
        <div className="row">
          <button className="primary accent" onClick={() => onApply(hint.personId, hint.cell)}>
            Ubicar a {name(hint.personId)}
          </button>
        </div>
      </>
    );
  } else {
    const steps = hint.steps;
    const visible = steps.slice(0, shown);
    const done = shown >= steps.length;
    body = (
      <>
        <ol className="hint-steps">
          {visible.map((s, i) => (
            <li key={i}>
              <button className="ghost step" onClick={() => onFocus(s.focus)} title="Ver en el plano">
                <span className="eyebrow">
                  Paso {i + 1} de {steps.length} · {TECHNIQUE_NAME[s.technique]}
                </span>
                <span>{s.reason}</span>
              </button>
            </li>
          ))}
        </ol>
        {steps.length === 0 && <p>Es la única fila y la única columna que quedan libres.</p>}
        {done ? (
          <p className="conclusion">
            Conclusión: <strong>{name(hint.personId)}</strong> va en <strong>{label(hint.cell)}</strong>.
          </p>
        ) : null}
        <div className="row">
          {!done && (
            <button
              onClick={() => {
                setShown(shown + 1);
                onFocus(steps[shown].focus);
              }}
            >
              Siguiente paso
            </button>
          )}
          {!done && <button onClick={() => setShown(steps.length)}>Ver la conclusión</button>}
          {done && (
            <button className="primary accent" onClick={() => onApply(hint.personId, hint.cell)}>
              Ubicar a {name(hint.personId)}
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <section className="hint-panel" role="status" aria-label="Ayuda">
      <header>
        <h3 className="eyebrow">💡 Ayuda</h3>
        <button className="ghost" onClick={onClose} aria-label="Cerrar ayuda">
          ×
        </button>
      </header>
      {body}
    </section>
  );
}
