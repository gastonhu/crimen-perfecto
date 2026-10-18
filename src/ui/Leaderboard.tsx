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
  const isMe = (a: string) => me && a.toLowerCase() === me.toLowerCase();
  return (
    <aside className={`leaderboard ${open ? 'open' : ''}`} aria-label="Marcador">
      <button className="lb-toggle" onClick={onToggle} aria-expanded={open}>
        🏆 Marcador
      </button>
      <div className="lb-body">
        {!online && <p className="note">Modo local: el marcador solo vive en este navegador.</p>}
        {puzzle && (
          <>
            <h3>{puzzle.title}</h3>
            {puzzle.rows.length === 0 ? (
              <p className="note">Nadie lo resolvió todavía. ¡Podés ser el primero!</p>
            ) : (
              <table>
                <tbody>
                  {puzzle.rows.map((r, i) => (
                    <tr key={r.alias} className={isMe(r.alias) ? 'me' : ''}>
                      <td>{i + 1}</td>
                      <td>{r.alias}</td>
                      <td className="num">{formatTime(r.seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
        <h3>Ranking general</h3>
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
                <tr key={r.alias} className={isMe(r.alias) ? 'me' : ''}>
                  <td>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                  <td>{r.alias}</td>
                  <td className="num">{r.points}</td>
                  <td className="num">{r.solved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </aside>
  );
}
