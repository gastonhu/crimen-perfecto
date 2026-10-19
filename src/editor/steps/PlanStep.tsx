// Paso 1: tamaño, habitaciones (pincel), muebles, ventanas y puertas.
import { useMemo, useState } from 'react';
import { OBJECTS, roomIds, type Cell, type ObjectCode, type Side } from '../../engine';
import { BoardView } from '../../ui/BoardView';
import { boardOf, boardPuzzle, cellName, IssueList, type StepProps } from '../common';
import { MAX_SIZE, MIN_SIZE, ROOM_LETTERS, hasSide, nextRoomLetter, sideKind } from '../draft';
import type { Issue } from '../issues';

type Tool = 'rooms' | 'objects' | 'sides';

const SIDE_NAME: Record<Side, string> = { N: 'Norte', S: 'Sur', E: 'Este', O: 'Oeste' };
const CODES = Object.keys(OBJECTS) as Exclude<ObjectCode, '.'>[];

/** Lado más cercano al punto tocado, si está cerca de un borde (x, y de 0 a 1). */
function nearSide(x: number, y: number): Side | null {
  const d: [Side, number][] = [
    ['N', y],
    ['S', 1 - y],
    ['O', x],
    ['E', 1 - x],
  ];
  const [side, dist] = d.reduce((a, b) => (b[1] < a[1] ? b : a));
  return dist < 0.28 ? side : null;
}

export function PlanStep({ doc, dispatch, issues }: StepProps & { issues: Issue[] }) {
  const d = doc.draft;
  const [tool, setTool] = useState<Tool>('rooms');
  const [brush, setBrush] = useState<string>(() => roomIds(d)[0] ?? 'A');
  const [object, setObject] = useState<ObjectCode>('T');
  const [sideCell, setSideCell] = useState<Cell | null>(null);
  const [newLetter, setNewLetter] = useState<string>('');
  const [newName, setNewName] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const p = useMemo(() => boardPuzzle(d), [d]);
  const board = useMemo(() => boardOf(d), [d]);
  const order = roomIds(d);
  const letters = Object.keys(d.roomNames).sort();
  const cellsOf = (l: string) => d.rooms.join('').split('').filter((ch) => ch === l).length;
  const letter = newLetter && d.roomNames[newLetter] === undefined ? newLetter : (nextRoomLetter(d) ?? '');
  const brushLetter = d.roomNames[brush] !== undefined ? brush : letters[0];

  const paint = (cell: Cell, stroke: boolean) => {
    if (tool === 'rooms' && brushLetter) dispatch({ type: 'paintRoom', cell, letter: brushLetter, stroke });
    if (tool === 'objects') dispatch({ type: 'setObject', cell, code: object, stroke });
  };

  const createRoom = () => {
    if (!letter || !newName.trim()) return;
    dispatch({ type: 'addRoom', letter, name: newName.trim() });
    setBrush(letter);
    setNewName('');
    setNewLetter('');
    setTool('rooms');
  };

  const swatch = (l: string) => {
    const i = order.indexOf(l);
    return i >= 0 ? `room-${(i % 8) + 1}` : 'ed-swatch-empty';
  };

  return (
    <div className="ed-step ed-plan">
      <div className="ed-board-col">
        <div className="row ed-toolrow">
          <label className="ed-field-inline">
            Tamaño
            <select value={d.size} onChange={(e) => dispatch({ type: 'resize', size: Number(e.target.value) })}>
              {Array.from({ length: MAX_SIZE - MIN_SIZE + 1 }, (_, i) => MIN_SIZE + i).map((n) => (
                <option key={n} value={n}>
                  {n}×{n}
                </option>
              ))}
            </select>
          </label>
          <div className="segmented" role="group" aria-label="Herramienta">
            <button aria-pressed={tool === 'rooms'} onClick={() => setTool('rooms')}>
              Habitaciones
            </button>
            <button aria-pressed={tool === 'objects'} onClick={() => setTool('objects')}>
              Muebles
            </button>
            <button aria-pressed={tool === 'sides'} onClick={() => setTool('sides')}>
              Ventanas y puertas
            </button>
          </div>
        </div>
        <BoardView
          puzzle={p}
          board={board}
          bad={new Set()}
          highlight={new Set(sideCell && tool === 'sides' ? [`${sideCell.r},${sideCell.c}`] : [])}
          selected={null}
          allowBlocked
          onPaint={(cell, { first, x, y }) => {
            if (tool !== 'sides') return paint(cell, !first);
            if (!first) return;
            setSideCell(cell);
            const side = nearSide(x, y);
            if (side && sideKind(d, cell, side)) dispatch({ type: 'toggleSide', cell, side });
          }}
          onCell={(cell) => (tool === 'sides' ? setSideCell(cell) : paint(cell, false))}
        />
        <p className="note ed-tip">
          {tool === 'rooms' && `Pincel: ${d.roomNames[brushLetter] || brushLetter}. Tocá o arrastrá sobre las casillas para pintarlas.`}
          {tool === 'objects' && `Pincel: ${object === '.' ? 'piso libre (borra muebles)' : OBJECTS[object].name}. Tocá o arrastrá sobre las casillas.`}
          {tool === 'sides' &&
            'Tocá cerca del borde de una casilla: en una pared exterior pone o saca una ventana; entre dos habitaciones, una puerta. Tocando el centro elegís la casilla para usar los botones.'}
        </p>
        {tool === 'sides' && sideCell && (
          <div className="ed-sides card" role="group" aria-label={`Lados de ${cellName(sideCell)}`}>
            <span className="eyebrow">Casilla {cellName(sideCell)}</span>
            <div className="row">
              {(['N', 'S', 'E', 'O'] as Side[]).map((side) => {
                const kind = sideKind(d, sideCell, side);
                const on = hasSide(d, sideCell, side);
                return (
                  <button
                    key={side}
                    disabled={!kind}
                    aria-pressed={on}
                    className={on ? 'ed-on' : ''}
                    onClick={() => dispatch({ type: 'toggleSide', cell: sideCell, side })}
                    title={kind ? undefined : 'Del otro lado está la misma habitación'}
                  >
                    {SIDE_NAME[side]}: {kind === 'windows' ? (on ? '✓ ventana' : 'ventana') : kind === 'doors' ? (on ? '✓ puerta' : 'puerta') : '—'}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <IssueList issues={issues} ok="El plano está listo." />
      </div>

      <div className="ed-side-col">
        {tool !== 'objects' && (
          <section className="ed-panel-box" aria-labelledby="ed-rooms-title">
            <h3 id="ed-rooms-title" className="eyebrow">
              Habitaciones
            </h3>
            <ul className="ed-rooms">
              {letters.map((l) => (
                <li key={l} className={brushLetter === l && tool === 'rooms' ? 'on' : ''}>
                  <button
                    className={`ed-room-pick ${swatch(l)}`}
                    aria-pressed={brushLetter === l && tool === 'rooms'}
                    onClick={() => {
                      setBrush(l);
                      setTool('rooms');
                    }}
                    aria-label={`Pintar con ${d.roomNames[l] || l}`}
                    title="Usar como pincel"
                  >
                    {l}
                  </button>
                  <input
                    aria-label={`Nombre de la habitación ${l}`}
                    value={d.roomNames[l]}
                    placeholder="la cocina"
                    onChange={(e) => dispatch({ type: 'renameRoom', letter: l, name: e.target.value })}
                  />
                  <span className="ed-count" title="Casillas">
                    {cellsOf(l)}
                  </span>
                  <button className="ghost icon" disabled={letters.length < 2} onClick={() => setRemoving(l)} aria-label={`Borrar ${d.roomNames[l] || l}`}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
            {removing && (
              <div className="ed-inline-confirm" role="group" aria-label="Borrar habitación">
                <span>
                  ¿Borrar {d.roomNames[removing] || removing}? Sus casillas pasan a {d.roomNames[letters.find((l) => l !== removing)!]}, y se
                  quitan las pistas que la nombran.
                </span>
                <div className="row">
                  <button onClick={() => setRemoving(null)}>Cancelar</button>
                  <button
                    className="danger"
                    onClick={() => {
                      dispatch({ type: 'removeRoom', letter: removing, into: letters.find((l) => l !== removing)! });
                      setRemoving(null);
                    }}
                  >
                    Borrar
                  </button>
                </div>
              </div>
            )}
            <form
              className="ed-newroom"
              onSubmit={(e) => {
                e.preventDefault();
                createRoom();
              }}
            >
              <span className="eyebrow">Nueva habitación</span>
              <div className="row">
                <select aria-label="Letra" value={letter} onChange={(e) => setNewLetter(e.target.value)}>
                  {[...ROOM_LETTERS]
                    .filter((l) => d.roomNames[l] === undefined)
                    .map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                </select>
                <input aria-label="Nombre con artículo" placeholder='con artículo: "la cocina"' value={newName} onChange={(e) => setNewName(e.target.value)} />
                <button type="submit" disabled={!letter || !newName.trim()}>
                  Crear
                </button>
              </div>
            </form>
          </section>
        )}
        {tool === 'objects' && (
          <section className="ed-panel-box" aria-labelledby="ed-obj-title">
            <h3 id="ed-obj-title" className="eyebrow">
              Muebles
            </h3>
            <div className="ed-objects" role="group" aria-label="Mueble">
              {CODES.map((code) => (
                <button key={code} aria-pressed={object === code} onClick={() => setObject(code)} className="ed-object">
                  <svg className={`ico-obj ${OBJECTS[code].blocking ? 'block' : 'free'}`} aria-hidden>
                    <use href={`#obj-${code}`} />
                  </svg>
                  <span>
                    {OBJECTS[code].name}
                    <small>
                      <code>{code}</code> · {OBJECTS[code].blocking ? 'bloquea' : 'se ocupa'}
                    </small>
                  </span>
                </button>
              ))}
              <button aria-pressed={object === '.'} onClick={() => setObject('.')} className="ed-object">
                <span aria-hidden className="ico-obj">⌫</span>
                <span>
                  Piso libre<small>borra muebles</small>
                </span>
              </button>
            </div>
            <p className="note">Los que bloquean no dejan pararse a nadie en la casilla. Sillas, camas y alfombras sí.</p>
          </section>
        )}
        <section className="ed-panel-box">
          <h3 className="eyebrow">Ventanas y puertas</h3>
          <p className="note">
            {(d.windows ?? []).length} ventanas: {(d.windows ?? []).join(', ') || 'ninguna'} · {(d.doors ?? []).length} puertas:{' '}
            {(d.doors ?? []).join(', ') || 'ninguna'}
          </p>
        </section>
      </div>
    </div>
  );
}
