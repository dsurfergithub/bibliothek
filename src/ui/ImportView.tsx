import { useEffect, useRef, useState } from 'react';
import { analyze, humanizeError, STAGE_LABELS, type AnalysisInput, type Stage } from '../services/analyzer';
import { getApiKey, getModel } from '../services/apiKey';
import { companionOnline } from '../services/companion';
import { saveCard } from '../services/db';
import type { KnowledgeCard } from '../domain/types';

type Mode = 'video' | 'youtube' | 'instagram' | 'texto';

const STAGE_ORDER: Stage[] = ['preparando', 'descargando', 'subiendo', 'procesando', 'analizando', 'guardando'];

const IG_URL = /^https?:\/\/(www\.)?instagram\.com\/([\w.]+\/)?(reel|reels|p|tv)\//;

export function ImportView({ onSaved }: { onSaved: (card: KnowledgeCard) => void }) {
  const [mode, setMode] = useState<Mode>('video');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [igUrl, setIgUrl] = useState('');
  const [text, setText] = useState('');
  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  /** null = comprobando; luego true/false según responda el compañero local. */
  const [companion, setCompanion] = useState<boolean | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const busy = stage !== null;

  useEffect(() => {
    if (mode !== 'instagram') return;
    setCompanion(null);
    let alive = true;
    companionOnline().then((ok) => alive && setCompanion(ok));
    return () => {
      alive = false;
    };
  }, [mode]);

  const input: AnalysisInput | null =
    mode === 'video' && file
      ? { kind: 'video', file }
      : mode === 'youtube' && /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url.trim())
        ? { kind: 'youtube', url }
        : mode === 'instagram' && companion === true && IG_URL.test(igUrl.trim())
          ? { kind: 'instagram', url: igUrl }
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

  // Etapas visibles según el tipo de fuente: descargar solo aplica a Instagram;
  // subir/procesar solo a vídeos (locales o descargados).
  const visibleStages = STAGE_ORDER.filter((s) => {
    if (s === 'descargando') return mode === 'instagram';
    if (s === 'subiendo' || s === 'procesando') return mode === 'video' || mode === 'instagram';
    return true;
  });

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
            ['video', '🎞️ Vídeo'],
            ['youtube', '▶️ YouTube'],
            ['instagram', '📸 Instagram'],
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
            Para cualquier vídeo que ya tengas en el equipo. Si es un Reel de Instagram, usa la
            pestaña 📸 Instagram y pega la URL directamente; para YouTube basta con la URL.
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

      {mode === 'instagram' && (
        <div className="field">
          <label>URL del Reel de Instagram</label>
          <input
            className="input"
            type="url"
            placeholder="https://www.instagram.com/reel/…"
            value={igUrl}
            onChange={(e) => setIgUrl(e.target.value)}
          />
          {companion === true && (
            <p className="hint" style={{ marginTop: 8 }}>
              ✅ Compañero local detectado: pega la URL y el reel se descarga y analiza solo.
            </p>
          )}
          {companion === false && (
            <div className="error-box" style={{ marginTop: 8 }}>
              El compañero local no está en marcha. Arráncalo con doble clic en{' '}
              <code>companion\start.cmd</code> (dentro de la carpeta del proyecto) y{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setCompanion(null);
                  companionOnline().then(setCompanion);
                }}
              >
                vuelve a comprobar
              </a>
              .
            </div>
          )}
          {companion === null && (
            <p className="hint" style={{ marginTop: 8 }}>
              Buscando el compañero local…
            </p>
          )}
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
