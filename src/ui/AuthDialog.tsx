import { useState } from 'react';
import { ALIAS_RE, PIN_RE, backend, type Session } from '../api';

export function AuthDialog({ onDone }: { onDone: (s: Session) => void }) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [alias, setAlias] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!ALIAS_RE.test(alias.trim())) return setError('El alias debe tener de 3 a 20 letras, números, guion, punto o guion bajo.');
    if (!PIN_RE.test(pin)) return setError('El PIN debe tener de 4 a 6 dígitos.');
    setBusy(true);
    try {
      onDone(mode === 'register' ? await backend.register(alias.trim(), pin) : await backend.login(alias.trim(), pin));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth card" onSubmit={submit}>
      <h2>{mode === 'register' ? 'Nuevo detective' : 'Volver al caso'}</h2>
      <p className="note">
        {mode === 'register'
          ? 'Elegí un alias para el marcador público y un PIN para entrar desde otro dispositivo.'
          : 'Ingresá con tu alias y PIN.'}
      </p>
      <label>
        Alias
        <input value={alias} onChange={(e) => setAlias(e.target.value)} autoComplete="username" maxLength={20} autoFocus />
      </label>
      <label>
        PIN
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          type="password"
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          maxLength={6}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>
        {mode === 'register' ? 'Registrarme' : 'Entrar'}
      </button>
      <button type="button" className="ghost" onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>
        {mode === 'register' ? 'Ya tengo alias' : 'Crear un alias nuevo'}
      </button>
    </form>
  );
}
