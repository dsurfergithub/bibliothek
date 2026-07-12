import { useRef, useState } from 'react';
import { getApiKey, getModel, MODELS, setApiKey, setModel, validateApiKey } from '../services/apiKey';
import { clearAll, importCards, listCards } from '../services/db';
import { downloadText } from '../services/exporters';
import { buildSyncLink } from '../services/sync';
import type { KnowledgeCard } from '../domain/types';

export function Settings({ onLibraryChanged }: { onLibraryChanged: () => void }) {
  const [key, setKey] = useState('');
  const [model, setModelState] = useState(getModel());
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [linkOut, setLinkOut] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  const current = getApiKey();
  const masked = current ? `${current.slice(0, 6)}…${current.slice(-4)}` : '—';

  async function changeKey() {
    setBusy(true);
    setMsg(null);
    try {
      await validateApiKey(key);
      setApiKey(key);
      setKey('');
      setMsg({ kind: 'ok', text: 'API key actualizada y validada.' });
    } catch {
      setMsg({ kind: 'error', text: 'La clave no es válida.' });
    } finally {
      setBusy(false);
    }
  }

  async function exportLibrary() {
    const cards = await listCards();
    downloadText(
      `bibliotheke-export-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ app: 'bibliotheke', version: 1, cards }, null, 2),
      'application/json'
    );
  }

  async function importLibrary(file: File) {
    try {
      const data = JSON.parse(await file.text());
      const cards: KnowledgeCard[] = Array.isArray(data) ? data : data.cards;
      if (!Array.isArray(cards)) throw new Error('formato');
      const n = await importCards(cards);
      onLibraryChanged();
      setMsg({ kind: 'ok', text: `Importadas ${n} fichas.` });
    } catch {
      setMsg({ kind: 'error', text: 'El archivo no es una exportación válida de Bibliotheke.' });
    }
  }

  /** Genera el enlace #sync= con toda la biblioteca y lo copia o comparte. */
  async function syncLink(viaShare: boolean) {
    setMsg(null);
    setLinkOut(null);
    try {
      const cards = await listCards();
      if (cards.length === 0) {
        setMsg({ kind: 'error', text: 'La biblioteca está vacía: no hay nada que sincronizar.' });
        return;
      }
      const link = await buildSyncLink(cards);
      // Más allá de ~100k caracteres los enlaces se truncan en apps de mensajería.
      if (link.length > 100_000) {
        setMsg({
          kind: 'error',
          text: 'La biblioteca es demasiado grande para un enlace. Usa Exportar + Importar con archivo.',
        });
        return;
      }
      if (viaShare && navigator.share) {
        await navigator.share({ title: 'Bibliotheke', url: link }).catch(() => {});
        return;
      }
      try {
        await navigator.clipboard.writeText(link);
        setMsg({
          kind: 'ok',
          text: `Enlace copiado (${cards.length} fichas). Ábrelo en el otro dispositivo para importarlas.`,
        });
      } catch {
        // Sin permiso de portapapeles: mostramos el enlace para copiarlo a mano.
        setLinkOut(link);
      }
    } catch {
      setMsg({ kind: 'error', text: 'No se pudo generar el enlace de sincronización.' });
    }
  }

  async function wipe() {
    if (!confirm('Esto borrará TODAS las fichas de este dispositivo. ¿Continuar?')) return;
    await clearAll();
    onLibraryChanged();
    setMsg({ kind: 'ok', text: 'Biblioteca vaciada.' });
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Ajustes</h1>

      {msg && <div className={msg.kind === 'ok' ? 'ok-box' : 'error-box'}>{msg.text}</div>}

      <div className="settings-section card">
        <h2>API key de Gemini</h2>
        <p className="hint">
          Clave actual: <code>{masked}</code>. Se guarda únicamente en este dispositivo y solo se
          envía a la API de Google. Consíguela en{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            Google AI Studio
          </a>.
        </p>
        <div className="settings-row" style={{ marginTop: 10 }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 200 }}
            type="password"
            placeholder="Nueva API key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <button className="btn" disabled={busy || !key.trim()} onClick={changeKey}>
            {busy ? 'Validando…' : 'Cambiar'}
          </button>
        </div>
      </div>

      <div className="settings-section card">
        <h2>Modelo</h2>
        <select
          className="select"
          value={model}
          onChange={(e) => {
            setModelState(e.target.value);
            setModel(e.target.value);
          }}
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="settings-section card">
        <h2>Usar en móvil y PC</h2>
        <p className="hint">
          Genera un enlace que contiene toda tu biblioteca (comprimida, sin la API key) y ábrelo en
          el otro dispositivo: las fichas se importan ahí. Envíatelo por WhatsApp, Telegram o email.
          No es sincronización en vivo — repite cuando quieras actualizar el otro dispositivo. La
          API key hay que ponerla en cada dispositivo.
        </p>
        <div className="settings-row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => syncLink(false)}>🔗 Copiar enlace de sincronización</button>
          {'share' in navigator && (
            <button className="btn" onClick={() => syncLink(true)}>📤 Enviar a otro dispositivo</button>
          )}
        </div>
        {linkOut && (
          <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
            <label>No se pudo copiar automáticamente — copia el enlace a mano:</label>
            <textarea
              className="textarea"
              style={{ minHeight: 70, fontSize: 12.5 }}
              readOnly
              value={linkOut}
              onFocus={(e) => e.target.select()}
            />
          </div>
        )}
      </div>

      <div className="settings-section card">
        <h2>Tus datos</h2>
        <p className="hint">
          Toda la biblioteca vive en este dispositivo (IndexedDB). Exporta un JSON como copia de
          seguridad o para moverla a otro dispositivo.
        </p>
        <div className="settings-row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={exportLibrary}>⬇️ Exportar biblioteca</button>
          <button className="btn" onClick={() => importInput.current?.click()}>⬆️ Importar</button>
          <button className="btn danger" onClick={wipe}>Borrar todo</button>
          <input
            ref={importInput}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importLibrary(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="settings-section card">
        <h2>Acerca de</h2>
        <p className="hint" style={{ margin: 0 }}>
          <strong>Bibliotheke</strong> · «No guardes contenido. Guarda conocimiento.» Convierte
          Reels, vídeos de YouTube y textos en fichas de conocimiento estructurado con Gemini.
          100% local: sin servidores, sin cuentas, tu clave y tus datos no salen de aquí.
        </p>
      </div>
    </div>
  );
}
