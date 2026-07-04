import { useState } from 'react';
import { setApiKey, validateApiKey } from '../services/apiKey';

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await validateApiKey(key);
      setApiKey(key);
      onDone();
    } catch {
      setError('La clave no es válida. Comprueba que la has copiado completa y que la API de Gemini está habilitada.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onboarding">
      <img className="logo" src="/icon.svg" alt="" />
      <h1>Bibliotheke</h1>
      <p className="philosophy">«No guardes contenido. Guarda conocimiento.»</p>

      <div className="card steps">
        <p style={{ marginTop: 0 }}>
          Bibliotheke usa <strong>tu propia clave de Gemini</strong>. Se guarda solo en este
          dispositivo y solo se envía a Google, nunca a otros servidores.
        </p>
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li>
            Entra en{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              aistudio.google.com/apikey
            </a>
          </li>
          <li>Crea una API key (el nivel gratuito es suficiente).</li>
          <li>Pégala aquí abajo.</li>
        </ol>
      </div>

      <form onSubmit={submit}>
        <div className="field">
          <input
            className="input"
            type="password"
            placeholder="Pega tu API key de Gemini"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoFocus
          />
        </div>
        {error && <div className="error-box">{error}</div>}
        <button className="btn primary" type="submit" disabled={busy || !key.trim()} style={{ width: '100%' }}>
          {busy ? 'Validando…' : 'Validar y empezar'}
        </button>
      </form>
    </div>
  );
}
