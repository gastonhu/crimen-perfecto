import type { Puzzle } from '../engine';
import { PUZZLES, THEMES } from '../puzzles';

export function CaseSelect({ solved, onPick }: { solved: Set<string>; onPick: (p: Puzzle) => void }) {
  const themes = Object.keys(THEMES).filter((t) => PUZZLES.some((p) => p.theme === t));
  return (
    <section className="cases">
      <h2>Elegí un caso</h2>
      {themes.map((t) => (
        <div key={t} className="theme">
          <h3>
            {THEMES[t].icon} {THEMES[t].name}
          </h3>
          <div className="case-grid">
            {PUZZLES.filter((p) => p.theme === t).map((p) => (
              <button key={p.id} className={`case card ${solved.has(p.id) ? 'done' : ''}`} onClick={() => onPick(p)}>
                <strong>{p.title}</strong>
                <span className="meta">
                  {p.size}×{p.size} · {'●'.repeat(p.difficulty)}
                  {'○'.repeat(5 - p.difficulty)}
                </span>
                <span className="badge">{solved.has(p.id) ? '✓ Resuelto' : 'Sin resolver'}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
