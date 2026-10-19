import type { GlobalRow, PuzzleRow } from '../api';
import { formatTime } from './format';

interface Props {
  online: boolean;
  me?: string;
  global: GlobalRow[];
  puzzle?: { title: string; rows: PuzzleRow[] };
  open: boolean;
  onToggle: () => void;
}

export function Leaderboard({ online, me, global, puzzle, open, onToggle }: Props) {
  const isMe = (a: string) => !!me && a.toLowerCase() === me.toLowerCase();
  const rank = global.findIndex((r) => isMe(r.alias));
  const summary = [
    rank >= 0 ? `#${rank + 1} · ${global[rank].points} pts` : null,
    puzzle?.rows[0] ? `récord ${formatTime(puzzle.rows[0].seconds)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      {open && <div className="overlay lb-overlay" onClick={onToggle} />}
    <aside className={`leaderboard ${open ? 'open' : ''}`} aria-label="Marcador">
      <button className="lb-toggle" onClick={onToggle} aria-expanded={open}>
        <span>🏆 Marcador</span>
        <span className="lb-summary">{summary || 'Ver ranking'}</span>
        <span aria-hidden>{open ? '▾' : '▴'}</span>
      </button>
      <h2 className="lb-title">Marcador</h2>
      <div className="lb-body">
        {!online && <p className="note">Modo local: el marcador solo vive en este navegador.</p>}
        {puzzle && (
          <>
            <h3 className="eyebrow">Este caso · mejores tiempos</h3>
            {puzzle.rows.length === 0 ? (
              <p className="note">Nadie lo resolvió todavía. ¡Podés ser el primero!</p>
            ) : (
              <table>
                <tbody>
                  {puzzle.rows.map((r, i) => (
                    <tr key={r.alias} className={isMe(r.alias) ? 'is-me' : ''}>
                      <td className={`pos ${i === 0 ? 'first' : ''}`}>{i + 1}</td>
                      <td title={r.alias}>{r.alias}</td>
                      <td className="num">{formatTime(r.seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
        <h3 className="eyebrow">Ranking general</h3>
        {global.length === 0 ? (
          <p className="note">Todavía no hay detectives en el ranking.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Detective</th>
                <th className="num">Pts</th>
                <th className="num">Casos</th>
              </tr>
            </thead>
            <tbody>
              {global.map((r, i) => (
                <tr key={r.alias} className={isMe(r.alias) ? 'is-me' : ''}>
                  <td className={`pos ${i === 0 ? 'first' : ''}`}>{i + 1}</td>
                  <td title={r.alias}>{r.alias}</td>
                  <td className="num">{r.points}</td>
                  <td className="num">{r.solved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </aside>
    </>
  );
}
