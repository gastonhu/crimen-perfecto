import { useState } from 'react';
import { describeFact, type Puzzle } from '../engine';
import { themeInfo } from '../puzzles';
import { Icon, Monogram } from './Icon';
import { initials } from './initials';

export function crimeRuleText(p: Puzzle): string {
  return (p.crime ?? 'aloneWithVictim') === 'touchingVictim'
    ? 'El asesino es la única persona que estaba pegada en diagonal a la víctima.'
    : 'El asesino es el único sospechoso que quedó a solas con la víctima en la misma habitación.';
}

interface Props {
  puzzle: Puzzle;
  busy: boolean;
  onOpen: (strict: boolean) => void;
  onBack: () => void;
}

/** Pantalla previa al tablero: el reloj recién arranca al abrir el caso. */
export function Dossier({ puzzle: p, busy, onOpen, onBack }: Props) {
  const [strict, setStrict] = useState(false);
  const theme = themeInfo(p.theme);
  const short = initials(p.people);
  return (
    <section className="dossier card">
      <button className="ghost back" onClick={onBack}>
        <Icon name="ui-back" /> Casos
      </button>
      <span className="eyebrow">
        <Icon name={theme.icon} /> {theme.name} · Expediente {p.size}×{p.size} · dificultad {p.difficulty}/5
      </span>
      <h2>{p.title}</h2>
      <p className="story">{p.story}</p>

      <h3 className="eyebrow">Involucrados</h3>
      <ul className="dossier-people">
        {p.people.map((x) => (
          <li key={x.id} className={x.role}>
            <Monogram person={x} text={short.get(x.id) ?? ''} />
            <span>
              {x.name}
              {x.role === 'victim' && <span className="tag danger">Víctima</span>}
            </span>
          </li>
        ))}
      </ul>

      <h3 className="eyebrow">Reglas del caso</h3>
      <ul className="dossier-rules">
        <li>Cada persona ocupa una casilla: una sola por fila y una sola por columna.</li>
        <li>{crimeRuleText(p)}</li>
        {(p.facts ?? []).map((f, i) => (
          <li key={i}>{f.text ?? describeFact(p, f.fact)}</li>
        ))}
      </ul>

      <label className="setting strict">
        <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} />
        <span>
          <strong>Modo estricto (+25% de puntos)</strong>
          <span className="note">Sin errores marcados al instante y sin ayudas. No se puede cambiar después de abrir el caso.</span>
        </span>
      </label>

      <div className="row">
        <button className="primary accent big" disabled={busy} onClick={() => onOpen(strict)}>
          Abrir el caso · arranca el reloj
        </button>
      </div>
    </section>
  );
}
