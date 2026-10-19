// Paso 2: personas (nombre, avatar, género, rol). Exactamente una víctima y tantas como filas tenga el plano.
import { useState } from 'react';
import type { Person } from '../../engine';
import { IssueList, type StepProps } from '../common';
import { MAX_SIZE, slug } from '../draft';
import type { Issue } from '../issues';

const AVATARS = ['🎩', '👒', '🛎️', '🍸', '📷', '🎸', '🧶', '🧳', '🌂', '🎻', '📚', '🧥', '💼', '🔧', '🍳', '🎨', '🕵️', '💾', '🚂', '🐎', '🌹', '🎲'];

function IdField({ person, taken, onChange }: { person: Person; taken: Set<string>; onChange: (to: string) => void }) {
  const [value, setValue] = useState(person.id);
  const [prev, setPrev] = useState(person.id);
  if (prev !== person.id) {
    setPrev(person.id);
    setValue(person.id);
  }
  const valid = /^[a-z0-9-]+$/.test(value) && (value === person.id || !taken.has(value));
  return (
    <label className="ed-field ed-id">
      Identificador
      <input
        value={value}
        spellCheck={false}
        aria-invalid={!valid}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => (valid && value !== person.id ? onChange(value) : setValue(person.id))}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {!valid && <small className="error">Minúsculas, números y guiones, sin repetir.</small>}
    </label>
  );
}

export function PeopleStep({ doc, dispatch, issues }: StepProps & { issues: Issue[] }) {
  const d = doc.draft;
  const ids = new Set(d.people.map((x) => x.id));
  const diff = d.size - d.people.length;

  const adjust = () => {
    if (diff > 0) for (let i = 0; i < diff; i++) dispatch({ type: 'addPerson' });
    else
      d.people
        .filter((x) => x.role !== 'victim')
        .slice(diff)
        .forEach((x) => dispatch({ type: 'removePerson', id: x.id }));
  };

  return (
    <div className="ed-step ed-people">
      <p className="note">
        Hacen falta <strong>{d.size} personas</strong>, una por fila y una por columna. Una es la víctima; el resto, sospechosos. El género (opcional)
        sirve para que las pistas concuerden ("sola", "sentado").
      </p>
      <datalist id="ed-avatars">
        {AVATARS.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
      <ol className="ed-person-list">
        {d.people.map((x, i) => (
          <li key={i} className={`card ed-person ${x.role}`}>
            <div className="ed-person-main">
              <label className="ed-field ed-avatar">
                Avatar
                <input value={x.avatar} list="ed-avatars" onChange={(e) => dispatch({ type: 'updatePerson', id: x.id, patch: { avatar: e.target.value } })} />
              </label>
              <label className="ed-field ed-name">
                Nombre
                <input
                  value={x.name}
                  maxLength={30}
                  onChange={(e) => dispatch({ type: 'renamePerson', id: x.id, name: e.target.value })}
                  aria-invalid={!x.name.trim()}
                />
              </label>
              <label className="ed-field ed-gender">
                Género
                <select
                  value={x.gender ?? ''}
                  onChange={(e) =>
                    dispatch({ type: 'updatePerson', id: x.id, patch: { gender: (e.target.value || undefined) as Person['gender'] } })
                  }
                >
                  <option value="">Sin dato</option>
                  <option value="f">Femenino</option>
                  <option value="m">Masculino</option>
                </select>
              </label>
              <label className="ed-check">
                <input
                  type="radio"
                  name="ed-victim"
                  checked={x.role === 'victim'}
                  onChange={() => dispatch({ type: 'updatePerson', id: x.id, patch: { role: 'victim' } })}
                />
                Víctima
              </label>
            </div>
            <div className="ed-person-extra">
              <IdField person={x} taken={ids} onChange={(to) => dispatch({ type: 'setPersonId', id: x.id, to })} />
              {x.id !== slug(x.name) && !/-\d+$/.test(x.id) && <small className="note">El id ya no sigue al nombre.</small>}
              <div className="row ed-person-tools">
                <button className="ghost icon" onClick={() => dispatch({ type: 'movePerson', id: x.id, delta: -1 })} disabled={i === 0} aria-label={`Subir a ${x.name}`}>
                  ↑
                </button>
                <button
                  className="ghost icon"
                  onClick={() => dispatch({ type: 'movePerson', id: x.id, delta: 1 })}
                  disabled={i === d.people.length - 1}
                  aria-label={`Bajar a ${x.name}`}
                >
                  ↓
                </button>
                <button className="ghost" onClick={() => dispatch({ type: 'removePerson', id: x.id })} aria-label={`Quitar a ${x.name}`}>
                  Quitar
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="row">
        <button onClick={() => dispatch({ type: 'addPerson' })} disabled={d.people.length >= MAX_SIZE}>
          + Agregar persona
        </button>
        {diff !== 0 && (
          <button className="primary accent" onClick={adjust}>
            {diff > 0 ? `Completar hasta ${d.size}` : `Dejar ${d.size} (quita los últimos sospechosos)`}
          </button>
        )}
      </div>
      <IssueList issues={issues} ok="Las personas están listas." />
    </div>
  );
}
