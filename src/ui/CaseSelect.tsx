import type { Puzzle } from '../engine';
import { themeInfo, usePuzzles } from '../puzzles';
import { Icon } from './Icon';
import { updateSettings, useSettings } from './settings';

export function CaseSelect({ solved, onPick, onTutorial }: { solved: Set<string>; onPick: (p: Puzzle) => void; onTutorial: () => void }) {
  const { tutorialSeen } = useSettings();
  const { list, loading, error } = usePuzzles();
  // Los temas en el orden de la lista (ya viene ordenada): incluye temas nuevos creados desde el editor.
  const themes = [...new Set(list.map((p) => p.theme))];
  return (
    <section className="cases">
      <span className="eyebrow">Archivo de casos</span>
      <h2>Elegí un expediente</h2>
      {!tutorialSeen && (
        <div className="msg hint-msg tutorial-banner">
          <span>
            <span className="telegram">Telegrama · </span>¿Primera vez? Hacé el tutorial: un caso de práctica de un
            minuto.
          </span>
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
      {loading && <p className="note">Buscando casos en el archivo…</p>}
      {error && (
        <p className="msg error" role="status">
          No pude traer los casos del servidor ({error}). Te muestro los que vienen con la app.
        </p>
      )}
      {themes.map((t) => {
        const cases = list.filter((p) => p.theme === t);
        return (
          <div key={t} className="theme">
            <h3 className="theme-title">
              <Icon name={themeInfo(t).icon} className="theme-ico" />
              {themeInfo(t).name}
              <span className="theme-count">
                {cases.length} {cases.length === 1 ? 'caso' : 'casos'}
              </span>
            </h3>
            <div className="case-grid">
              {cases.map((p, i) => (
                <button key={p.id} className={`case ${solved.has(p.id) ? 'done' : ''}`} onClick={() => onPick(p)}>
                  <span className="case-tab" aria-hidden>
                    N.º {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="case-body">
                    <span className="case-title">{p.title}</span>
                    <span className="case-meta">
                      <span className="chip">
                        Plano {p.size}×{p.size}
                      </span>
                      <span className="dots" role="img" aria-label={`Dificultad ${p.difficulty} de 5`}>
                        {Array.from({ length: 5 }, (_, i) => (
                          <span key={i} className={i < p.difficulty ? 'on' : ''} />
                        ))}
                      </span>
                    </span>
                    <span className="case-foot">
                      <span className={`chip ${solved.has(p.id) ? 'success' : ''}`}>
                        {solved.has(p.id) ? '✓ Resuelto' : 'Sin resolver'}
                      </span>
                      {solved.has(p.id) && <Icon name="seal" className="seal sm" />}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <div className="cases-foot">
        <button className="ghost tutorial-link" onClick={onTutorial}>
          <Icon name="ui-book" /> Repasar el tutorial
        </button>
        <a className="editor-link" href="#editor">
          <Icon name="tool-notes" /> Crear un caso
        </a>
      </div>
    </section>
  );
}
