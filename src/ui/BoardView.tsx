import { useRef, useState } from 'react';
import { OBJECTS, cellKey, colLabel, objectAt, roomAt, roomIds, roomLabel, type Cell, type Puzzle } from '../engine';
import type { Board } from './useGame';

interface Props {
  puzzle: Puzzle;
  board: Board;
  bad: Set<string>;
  highlight: Set<string>;
  selected: string | null;
  onCell: (cell: Cell, alt: boolean) => void;
}

const ARROWS: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

export function BoardView({ puzzle: p, board, bad, highlight, selected, onCell }: Props) {
  const rooms = roomIds(p);
  const [focus, setFocus] = useState<Cell>({ r: 0, c: 0 });
  const refs = useRef(new Map<string, HTMLButtonElement>());

  const firstCell = new Map<string, string>();
  for (let r = 0; r < p.size; r++)
    for (let c = 0; c < p.size; c++) if (!firstCell.has(roomAt(p, { r, c }))) firstCell.set(roomAt(p, { r, c }), `${r},${c}`);

  const who = new Map<string, string>();
  for (const [id, c] of Object.entries(board.placements)) if (c) who.set(cellKey(c), id);
  const marks = new Set(board.marks);

  // Cada casilla dibuja solo su borde superior e izquierdo; el contenedor, el derecho e inferior.
  const wallTop = (c: Cell) => c.r === 0 || roomAt(p, { r: c.r - 1, c: c.c }) !== roomAt(p, c);
  const wallLeft = (c: Cell) => c.c === 0 || roomAt(p, { r: c.r, c: c.c - 1 }) !== roomAt(p, c);

  const onKeyDown = (e: React.KeyboardEvent, cell: Cell) => {
    const d = ARROWS[e.key];
    if (!d) return;
    e.preventDefault();
    const next = { r: Math.min(p.size - 1, Math.max(0, cell.r + d[0])), c: Math.min(p.size - 1, Math.max(0, cell.c + d[1])) };
    setFocus(next);
    refs.current.get(cellKey(next))?.focus();
  };

  return (
    <div className="board-wrap">
      <div className="board" style={{ ['--n' as string]: p.size }}>
        <div className="axis-cols" aria-hidden>
          {Array.from({ length: p.size }, (_, c) => (
            <span key={c}>{colLabel(c)}</span>
          ))}
        </div>
        <div className="axis-rows" aria-hidden>
          {Array.from({ length: p.size }, (_, r) => (
            <span key={r}>{r + 1}</span>
          ))}
        </div>
        <div className="cells" role="grid" aria-label="Plano de la escena">
          {Array.from({ length: p.size }, (_, r) => (
            <div key={r} role="row" className="cells-row">
              {Array.from({ length: p.size }, (_, c) => {
                const cell = { r, c };
                const k = cellKey(cell);
                const rid = roomAt(p, cell);
                const obj = objectAt(p, cell);
                const info = obj === '.' ? null : OBJECTS[obj];
                const personId = who.get(k);
                const person = personId ? p.people.find((x) => x.id === personId) : null;
                const marked = !person && marks.has(k);
                const cls = [
                  'cell',
                  `room-${(rooms.indexOf(rid) % 8) + 1}`,
                  wallTop(cell) && 'wt',
                  wallLeft(cell) && 'wl',
                  info?.blocking && 'blocked',
                  highlight.has(k) && 'hint',
                  personId && personId === selected && 'selected',
                ]
                  .filter(Boolean)
                  .join(' ');
                const label = [
                  `${colLabel(c)}${r + 1}`,
                  p.roomNames[rid],
                  info?.name,
                  person?.name,
                  marked && 'marcada',
                  person && bad.has(person.id) && 'no cumple su pista',
                ]
                  .filter(Boolean)
                  .join(', ');
                return (
                  <button
                    key={k}
                    ref={(el) => {
                      if (el) refs.current.set(k, el);
                      else refs.current.delete(k);
                    }}
                    className={cls}
                    role="gridcell"
                    aria-label={label}
                    aria-disabled={info?.blocking || undefined}
                    tabIndex={focus.r === r && focus.c === c ? 0 : -1}
                    onFocus={() => setFocus(cell)}
                    onKeyDown={(e) => onKeyDown(e, cell)}
                    onClick={(e) => !info?.blocking && onCell(cell, e.shiftKey)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (!info?.blocking) onCell(cell, true);
                    }}
                  >
                    {firstCell.get(rid) === k && <span className="room-name">{roomLabel(p, rid)}</span>}
                    {info && (
                      <svg className={`obj ${info.blocking ? 'block' : 'free'} ${person || marked ? 'corner' : ''}`} aria-hidden>
                        <use href={`#obj-${obj}`} />
                      </svg>
                    )}
                    {person && (
                      <span className={`token ${person.role} ${bad.has(person.id) ? 'bad' : ''}`}>
                        <span className="avatar">{person.avatar}</span>
                        <span className="initial">{person.name[0]}</span>
                      </span>
                    )}
                    {marked && (
                      <svg className="mark" aria-hidden>
                        <use href="#mark-x" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
