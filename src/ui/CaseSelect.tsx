import type { Puzzle } from '../engine';
import { PUZZLES, THEMES } from '../puzzles';
import { updateSettings, useSettings } from './settings';

export function CaseSelect({ solved, onPick, onTutorial }: { solved: Set<string>; onPick: (p: Puzzle) => void; onTutorial: () => void }) {
  const { tutorialSeen } = useSettings();
  const themes = Object.keys(THEMES).filter((t) => PUZZLES.some((p) => p.theme === t));
  return (
    <section className="cases">
      <span className="eyebrow">Archivo de casos</span>
      <h2>Elegí un expediente</h2>
      {!tutorialSeen && (
        <div className="msg hint-msg tutorial-banner">
          <span>¿Primera vez? Hacé el tutorial: un caso de práctica de un minuto.</span>
          <span className="row">
            <button className="primary accent" onClick={onTutorial}>
              Empezar
            </button>
            <button className="ghost" onClick={() => updateSettings({ tutorialSeen: true })}>
              Ya sé jugar
            </button>
          </span>
        </div>
      )}
      {themes.map((t) => (
        <div key={t} className="theme">
          <h3 className="theme-title">
            <span aria-hidden>{THEMES[t].icon}</span> {THEMES[t].name}
          </h3>
          <div className="case-grid">
            {PUZZLES.filter((p) => p.theme === t).map((p) => (
              <button key={p.id} className={`case card ${solved.has(p.id) ? 'done' : ''}`} onClick={() => onPick(p)}>
                <span className="case-title">{p.title}</span>
                <span className="case-meta">
                  <span className="chip">
                    {p.size}×{p.size}
                  </span>
                  <span className="dots" aria-label={`Dificultad ${p.difficulty} de 5`}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <span key={i} className={i < p.difficulty ? 'on' : ''} />
                    ))}
                  </span>
                </span>
                <span className={`chip ${solved.has(p.id) ? 'success' : ''}`}>{solved.has(p.id) ? '✓ Resuelto' : 'Sin resolver'}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <button className="ghost tutorial-link" onClick={onTutorial}>
        🎓 Repasar el tutorial
      </button>
    </section>
  );
}
