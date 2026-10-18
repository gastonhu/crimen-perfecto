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

export function BoardView({ puzzle: p, board, bad, highlight, selected, onCell }: Props) {
  const rooms = roomIds(p);
  const firstCell = new Map<string, string>();
  for (let r = 0; r < p.size; r++)
    for (let c = 0; c < p.size; c++) if (!firstCell.has(roomAt(p, { r, c }))) firstCell.set(roomAt(p, { r, c }), `${r},${c}`);

  const who = new Map<string, string>();
  for (const [id, c] of Object.entries(board.placements)) if (c) who.set(cellKey(c), id);
  const marks = new Set(board.marks);

  const wall = (cell: Cell, dr: number, dc: number) => {
    const n = { r: cell.r + dr, c: cell.c + dc };
    return n.r < 0 || n.c < 0 || n.r >= p.size || n.c >= p.size || roomAt(p, n) !== roomAt(p, cell);
  };

  return (
    <div className="board-wrap">
      <div className="board" style={{ ['--n' as string]: p.size }} role="grid" aria-label="Plano de la escena">
        <div className="axis" />
        {Array.from({ length: p.size }, (_, c) => (
          <div key={`h${c}`} className="axis head">
            {colLabel(c)}
          </div>
        ))}
        {Array.from({ length: p.size }, (_, r) => [
          <div key={`r${r}`} className="axis">
            {r + 1}
          </div>,
          ...Array.from({ length: p.size }, (_, c) => {
            const cell = { r, c };
            const k = cellKey(cell);
            const rid = roomAt(p, cell);
            const obj = objectAt(p, cell);
            const info = obj === '.' ? null : OBJECTS[obj];
            const personId = who.get(k);
            const person = personId ? p.people.find((x) => x.id === personId) : null;
            const cls = [
              'cell',
              `room-${rooms.indexOf(rid) % 8}`,
              wall(cell, -1, 0) && 'wt',
              wall(cell, 1, 0) && 'wb',
              wall(cell, 0, -1) && 'wl',
              wall(cell, 0, 1) && 'wr',
              info?.blocking && 'blocked',
              obj === 'R' && 'rug',
              highlight.has(k) && 'hint',
              personId && bad.has(personId) && 'bad',
              personId && personId === selected && 'selected',
            ]
              .filter(Boolean)
              .join(' ');
            const label = `${colLabel(c)}${r + 1}, ${roomLabel(p, rid)}${info ? `, ${info.name}` : ''}${person ? `, ${person.name}` : ''}${marks.has(k) ? ', descartada' : ''}`;
            return (
              <button
                key={k}
                className={cls}
                role="gridcell"
                aria-label={label}
                disabled={!!info?.blocking}
                onClick={(e) => onCell(cell, e.shiftKey)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onCell(cell, true);
                }}
              >
                {firstCell.get(rid) === k && <span className="room-name">{roomLabel(p, rid)}</span>}
                {info && obj !== 'R' && <span className={person ? 'obj small' : 'obj'}>{info.icon}</span>}
                {person && (
                  <span className={`token ${person.role}`} title={person.name}>
                    <span className="avatar">{person.avatar}</span>
                    <span className="initial">{person.name[0]}</span>
                  </span>
                )}
                {!person && marks.has(k) && <span className="mark">✗</span>}
              </button>
            );
          }),
        ])}
      </div>
    </div>
  );
}
