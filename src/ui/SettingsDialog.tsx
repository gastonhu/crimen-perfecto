import { useEffect } from 'react';
import { updateSettings, useSettings, type Settings } from './settings';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const toggle = (key: 'liveErrors' | 'autoCross' | 'avatars', label: string, help: string) => (
    <label className="setting">
      <input type="checkbox" checked={s[key]} onChange={(e) => updateSettings({ [key]: e.target.checked })} />
      <span>
        <strong>{label}</strong>
        <span className="note">{help}</span>
      </span>
    </label>
  );
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <dialog open className="modal" aria-label="Ajustes">
        <h3>Ajustes</h3>
        {toggle(
          'liveErrors',
          'Marcar errores al instante',
          'Avisa si alguien comparte fila o columna, no cumple su pista o rompe un hecho. En modo estricto nunca se marca.',
        )}
        {toggle('autoCross', 'Apagar fila y columna al ubicar', 'Atenúa la fila y la columna de cada persona ya ubicada.')}
        {toggle('avatars', 'Mostrar avatares', 'Usa el dibujito de cada persona en lugar de su inicial en el plano y en las listas.')}
        <fieldset className="setting theme">
          <legend>
            <strong>Tema</strong>
          </legend>
          <div className="segmented" role="group" aria-label="Tema">
            {(
              [
                ['system', 'Sistema'],
                ['light', 'Claro'],
                ['dark', 'Oscuro'],
              ] as [Settings['theme'], string][]
            ).map(([value, text]) => (
              <button key={value} aria-pressed={s.theme === value} onClick={() => updateSettings({ theme: value })}>
                {text}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="row">
          <button className="primary" onClick={onClose} autoFocus>
            Listo
          </button>
        </div>
      </dialog>
    </>
  );
}
