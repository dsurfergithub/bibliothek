import { useRef, useState } from 'react';
import { analyze, humanizeError, STAGE_LABELS, type AnalysisInput, type Stage } from '../services/analyzer';
import { getApiKey, getModel } from '../services/apiKey';
import { saveCard } from '../services/db';
import type { KnowledgeCard } from '../domain/types';

type Mode = 'video' | 'youtube' | 'texto';

const STAGE_ORDER: Stage[] = ['preparando', 'subiendo', 'procesando', 'analizando', 'guardando'];

export function ImportView({ onSaved }: { onSaved: (card: KnowledgeCard) => void }) {
  const [mode, setMode] = useState<Mode>('video');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const busy = stage !== null;

  const input: AnalysisInput | null =
    mode === 'video' && file
      ? { kind: 'video', file }
      : mode === 'youtube' && /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url.trim())
        ? { kind: 'youtube', url }
        : mode === 'texto' && text.trim().length > 40
          ? { kind: 'texto', text }
          : null;

  async function run() {
    if (!input) return;
    const apiKey = getApiKey();
    if (!apiKey) return;
    setError(null);
    try {
      const card = await analyze(apiKey, getModel(), input, setStage);
      await saveCard(card);
      onSaved(card);
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setStage(null);
    }
  }

  // Etapas visibles según el tipo de fuente (subir/procesar solo aplica a vídeo grande).
  const visibleStages = STAGE_ORDER.filter(
    (s) => mode === 'video' || (s !== 'subiendo' && s !== 'procesando')
  );

  if (busy) {
    const currentIdx = visibleStages.indexOf(stage!);
    return (
      <div className="card">
        <h2 style={{ marginBottom: 4 }}>Analizando…</h2>
        <p className="hint">Gemini está destilando el conocimiento. Suele tardar menos de un minuto.</p>
        <ul className="stages">
          {visibleStages.map((s, i) => (
            <li key={s} className={i < currentIdx ? 'done' : i === currentIdx ? 'current' : ''}>
              <span className="dot">{i < currentIdx ? '✓' : ''}</span>
              {STAGE_LABELS[s]}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 14 }}>Añadir conocimiento</h1>

      <div className="segmented">
        {(
          [
            ['video', '🎞️ Reel / vídeo'],
            ['youtube', '▶️ YouTube'],
            ['texto', '📄 Texto'],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'video' && (
        <>
          <div
            className={`dropzone ${drag ? 'drag' : ''}`}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const dropped = e.dataTransfer.files[0];
              if (dropped) setFile(dropped);
            }}
          >
            <span className="icon">🎞️</span>
            {file ? (
              <strong>{file.name}</strong>
            ) : (
              <>
                Toca para elegir el vídeo del Reel
                <br />
                <span className="hint">o arrástralo aquí (MP4, MOV, WebM…)</span>
              </>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="video/*,audio/*"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Instagram no permite descargar Reels desde otras apps: guarda el vídeo en tu galería
            (o usa el archivo original si es tuyo) y súbelo aquí. Para YouTube basta con la URL.
          </p>
        </>
      )}

      {mode === 'youtube' && (
        <div className="field">
          <label>URL del vídeo o Short de YouTube</label>
          <input
            className="input"
            type="url"
            placeholder="https://www.youtube.com/watch?v=…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <p className="hint" style={{ marginTop: 8 }}>
            Gemini procesa la URL directamente: no hace falta descargar nada.
          </p>
        </div>
      )}

      {mode === 'texto' && (
        <div className="field">
          <label>Pega un artículo, hilo, newsletter o transcripción</label>
          <textarea
            className="textarea"
            rows={9}
            placeholder="Pega aquí el contenido…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      <button className="btn primary" style={{ width: '100%', marginTop: 8 }} disabled={!input} onClick={run}>
        ✨ Extraer conocimiento
      </button>
    </div>
  );
}
