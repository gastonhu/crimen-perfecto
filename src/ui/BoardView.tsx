import { useEffect, useRef, useState } from 'react';
import { OBJECTS, cellKey, colLabel, objectAt, roomAt, roomIds, roomLabel, sidesWith, type Cell, type Puzzle } from '../engine';
import type { Board } from './useGame';

interface Props {
  puzzle: Puzzle;
  board: Board;
  /** Personas que no cumplen su pista (se marcan si los errores al instante están activos). */
  bad: Set<string>;
  /** Casillas resaltadas (ayuda). */
  highlight: Set<string>;
  /** Si está, se atenúan todas las casillas que NO están en este set (pista interactiva, revelación). */
  focusCells?: Set<string> | null;
  /** Casillas atenuadas por "tachar fila y columna". */
  crossed?: Set<string>;
  selected: string | null;
  onCell: (cell: Cell, alt: boolean) => void;
  /** Soltar una ficha arrastrada en una casilla. */
  onDrop?: (personId: string, cell: Cell) => void;
  /** Casilla enfocada o bajo el dedo/mouse (para mostrar su detalle). */
  onInspect?: (cell: Cell | null) => void;
  locked?: boolean;
}

const ARROWS: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

interface Drag {
  personId: string;
  x: number;
  y: number;
  startX: number;
  startY: number;
  moved: boolean;
}

export function BoardView({ puzzle: p, board, bad, highlight, focusCells, crossed, selected, onCell, onDrop, onInspect, locked }: Props) {
  const rooms = roomIds(p);
  const [focus, setFocus] = useState<Cell>({ r: 0, c: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const suppressClick = useRef(false);
  const refs = useRef(new Map<string, HTMLButtonElement>());

  const firstCell = new Map<string, string>();
  for (let r = 0; r < p.size; r++)
    for (let c = 0; c < p.size; c++) if (!firstCell.has(roomAt(p, { r, c }))) firstCell.set(roomAt(p, { r, c }), `${r},${c}`);

  const who = new Map<string, string>();
  for (const [id, c] of Object.entries(board.placements)) if (c) who.set(cellKey(c), id);
  const marks = new Set(board.marks);
  const person = (id: string) => p.people.find((x) => x.id === id);

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

  // Arrastrar fichas (mouse y touch con pointer events). El ref evita efectos dentro de un setState.
  const dragRef = useRef<Drag | null>(null);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const startDrag = (d: Drag) => {
    dragRef.current = d;
    setDrag(d);
  };
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const next = { ...d, x: e.clientX, y: e.clientY, moved: d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 6 };
      dragRef.current = next;
      setDrag(next);
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d?.moved) return;
      suppressClick.current = true;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-cell]');
      if (el && dropRef.current) {
        const [r, c] = el.dataset.cell!.split(',').map(Number);
        dropRef.current(d.personId, { r, c });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    // Solo se re-suscribe al empezar o terminar un arrastre.
  }, [drag !== null]);

  const dragging = drag?.moved ? person(drag.personId) : null;

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
        <div className={`cells ${focusCells ? 'focusing' : ''}`} role="grid" aria-label="Plano de la escena" onPointerLeave={() => onInspect?.(null)}>
          {Array.from({ length: p.size }, (_, r) => (
            <div key={r} role="row" className="cells-row">
              {Array.from({ length: p.size }, (_, c) => {
                const cell = { r, c };
                const k = cellKey(cell);
                const rid = roomAt(p, cell);
                const obj = objectAt(p, cell);
                const info = obj === '.' ? null : OBJECTS[obj];
                const personId = who.get(k);
                const here = personId ? person(personId) : null;
                const marked = !here && marks.has(k);
                const notes = !here ? (board.notes[k] ?? []) : [];
                const windows = sidesWith(p, cell, 'windows');
                const doors = sidesWith(p, cell, 'doors');
                const cls = [
                  'cell',
                  `room-${(rooms.indexOf(rid) % 8) + 1}`,
                  wallTop(cell) && 'wt',
                  wallLeft(cell) && 'wl',
                  info?.blocking && 'blocked',
                  highlight.has(k) && 'hint',
                  personId && personId === selected && 'selected',
                  focusCells && !focusCells.has(k) && 'dimmed',
                  focusCells?.has(k) && 'lit',
                  crossed?.has(k) && !here && 'crossed',
                  drag?.moved && 'drop-target',
                ]
                  .filter(Boolean)
                  .join(' ');
                const label = [
                  `${colLabel(c)}${r + 1}`,
                  p.roomNames[rid],
                  info?.name,
                  windows.length && 'junto a una ventana',
                  doors.length && 'junto a una puerta',
                  here?.name,
                  marked && 'marcada',
                  notes.length && `notas: ${notes.map((id) => person(id)?.name).join(', ')}`,
                  here && bad.has(here.id) && 'no cumple su pista',
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
                    data-cell={k}
                    className={cls}
                    role="gridcell"
                    aria-label={label}
                    aria-disabled={info?.blocking || locked || undefined}
                    tabIndex={focus.r === r && focus.c === c ? 0 : -1}
                    onFocus={() => {
                      setFocus(cell);
                      onInspect?.(cell);
                    }}
                    onPointerEnter={(e) => e.pointerType === 'mouse' && onInspect?.(cell)}
                    onKeyDown={(e) => onKeyDown(e, cell)}
                    onClick={(e) => {
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      onInspect?.(cell);
                      if (!info?.blocking && !locked) onCell(cell, e.shiftKey);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (!info?.blocking && !locked) onCell(cell, true);
                    }}
                  >
                    {firstCell.get(rid) === k && <span className="room-name">{roomLabel(p, rid)}</span>}
                    {windows.map((side) => (
                      <span key={`w${side}`} className={`feature window side-${side}`} aria-hidden />
                    ))}
                    {doors.map((side) => (
                      <span key={`d${side}`} className={`feature door side-${side}`} aria-hidden />
                    ))}
                    {info && (
                      <svg className={`obj ${info.blocking ? 'block' : 'free'} ${here || marked || notes.length ? 'corner' : ''}`} aria-hidden>
                        <use href={`#obj-${obj}`} />
                      </svg>
                    )}
                    {here && (
                      <span
                        className={`token ${here.role} ${bad.has(here.id) ? 'bad' : ''} ${drag?.moved && drag.personId === here.id ? 'lifted' : ''}`}
                        onPointerDown={(e) => {
                          if (locked || !onDrop || e.button !== 0) return;
                          startDrag({ personId: here.id, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false });
                        }}
                      >
                        <span className="avatar">{here.avatar}</span>
                        <span className="initial">{here.name[0]}</span>
                      </span>
                    )}
                    {marked && (
                      <svg className="mark" aria-hidden>
                        <use href="#mark-x" />
                      </svg>
                    )}
                    {notes.length > 0 && (
                      <span className="notes" aria-hidden>
                        {notes.map((id) => (
                          <span key={id}>{person(id)?.name[0]}</span>
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {dragging && (
        <span className={`token drag-ghost ${dragging.role}`} style={{ left: drag!.x, top: drag!.y }} aria-hidden>
          <span className="avatar">{dragging.avatar}</span>
          <span className="initial">{dragging.name[0]}</span>
        </span>
      )}
    </div>
  );
}
