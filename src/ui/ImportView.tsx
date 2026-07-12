import { useEffect, useRef, useState } from 'react';
import { analyze, humanizeError, STAGE_LABELS, type AnalysisInput, type Stage } from '../services/analyzer';
import { getApiKey, getModel } from '../services/apiKey';
import { companionOnline } from '../services/companion';
import { listCards, saveCard } from '../services/db';
import { buildSyncLink } from '../services/sync';
import { dequeue, enqueue, listQueue, shortcodeOf, type PendingReel } from '../services/queue';
import type { KnowledgeCard } from '../domain/types';

type Mode = 'video' | 'youtube' | 'instagram' | 'texto';

const STAGE_ORDER: Stage[] = ['preparando', 'descargando', 'subiendo', 'procesando', 'analizando', 'guardando'];

const IG_URL = /^https?:\/\/(www\.)?instagram\.com\/([\w.]+\/)?(reel|reels|p|tv)\//;

interface BatchProgress {
  total: number;
  done: number;
}

export function ImportView({
  startTab,
  onSaved,
  onBatchDone,
}: {
  startTab?: 'instagram';
  onSaved: (card: KnowledgeCard) => void;
  onBatchDone?: () => void;
}) {
  const [mode, setMode] = useState<Mode>(startTab ?? 'video');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [igUrl, setIgUrl] = useState('');
  const [text, setText] = useState('');
  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  /** null = comprobando; luego true/false según responda el compañero local. */
  const [companion, setCompanion] = useState<boolean | null>(null);
  const [queue, setQueue] = useState<PendingReel[]>(() => listQueue());
  const [batch, setBatch] = useState<BatchProgress | null>(null);
  const [batchResult, setBatchResult] = useState<{ ok: number; errors: string[] } | null>(null);
  const [linkOut, setLinkOut] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const busy = stage !== null;
  const refreshQueue = () => setQueue(listQueue());

  useEffect(() => {
    if (mode !== 'instagram') return;
    setCompanion(null);
    let alive = true;
    companionOnline().then((ok) => alive && setCompanion(ok));
    return () => {
      alive = false;
    };
  }, [mode]);

  // Fuentes con botón único inferior (Instagram tiene sus propios botones).
  const input: AnalysisInput | null =
    mode === 'video' && file
      ? { kind: 'video', file }
      : mode === 'youtube' && /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url.trim())
        ? { kind: 'youtube', url }
        : mode === 'texto' && text.trim().length > 40
          ? { kind: 'texto', text }
          : null;

  const igValid = IG_URL.test(igUrl.trim());

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

  /** Instagram con compañero: descarga + analiza este reel ahora mismo. */
  async function analyzeNow() {
    if (!igValid) return;
    const apiKey = getApiKey();
    if (!apiKey) return;
    setError(null);
    setNotice(null);
    try {
      const card = await analyze(apiKey, getModel(), { kind: 'instagram', url: igUrl.trim() }, setStage);
      await saveCard(card);
      dequeue(igUrl.trim());
      setIgUrl('');
      refreshQueue();
      onSaved(card);
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setStage(null);
    }
  }

  function addToQueue() {
    setError(null);
    setNotice(null);
    if (enqueue(igUrl)) {
      setIgUrl('');
      refreshQueue();
      setNotice('Reel guardado en la cola.');
    } else {
      setError('No parece un reel de Instagram válido, o ya está en la cola.');
    }
  }

  function removeFromQueue(u: string) {
    dequeue(u);
    refreshQueue();
  }

  /** Instagram con compañero: procesa toda la cola, uno a uno. */
  async function processQueue() {
    const apiKey = getApiKey();
    if (!apiKey) return;
    const items = listQueue();
    if (items.length === 0) return;
    setError(null);
    setNotice(null);
    setBatchResult(null);
    const errors: string[] = [];
    let ok = 0;
    for (let i = 0; i < items.length; i++) {
      setBatch({ total: items.length, done: i });
      try {
        const card = await analyze(apiKey, getModel(), { kind: 'instagram', url: items[i].url }, setStage);
        await saveCard(card);
        dequeue(items[i].url);
        ok++;
      } catch (err) {
        errors.push(`${shortcodeOf(items[i].url) ?? items[i].url}: ${humanizeError(err)}`);
      }
    }
    setStage(null);
    setBatch(null);
    refreshQueue();
    setBatchResult({ ok, errors });
    onBatchDone?.();
  }

  /** Móvil: envía la cola (dentro del enlace de sync) al PC. */
  async function sendToPc() {
    setError(null);
    setNotice(null);
    setLinkOut(null);
    try {
      const link = await buildSyncLink(await listCards());
      if (link.length > 100_000) {
        setError('Hay demasiados datos para un enlace. Procesa parte de la cola o usa Exportar en Ajustes.');
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: 'Bibliotheke — reels para procesar', url: link }).catch(() => {});
        return;
      }
      try {
        await navigator.clipboard.writeText(link);
        setNotice('Enlace copiado. Ábrelo en tu PC (con el compañero abierto) para procesar los reels.');
      } catch {
        setLinkOut(link);
      }
    } catch {
      setError('No se pudo generar el enlace.');
    }
  }

  // Etapas visibles según el tipo de fuente: descargar solo aplica a Instagram;
  // subir/procesar solo a vídeos (locales o descargados).
  const visibleStages = STAGE_ORDER.filter((s) => {
    if (s === 'descargando') return mode === 'instagram';
    if (s === 'subiendo' || s === 'procesando') return mode === 'video' || mode === 'instagram';
    return true;
  });

  if (batch) {
    const pct = Math.round((batch.done / batch.total) * 100);
    return (
      <div className="card">
        <h2 style={{ marginBottom: 4 }}>Procesando reels…</h2>
        <p className="hint">
          Reel {batch.done + 1} de {batch.total}. {stage ? STAGE_LABELS[stage] : ''}
        </p>
        <div className="progress-track" style={{ marginTop: 14 }}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          No cierres esta pantalla. Cada reel se descarga y se analiza; los que fallen se quedan en la cola.
        </p>
      </div>
    );
  }

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
            Para cualquier vídeo que ya tengas en el equipo. En el móvil también puedes guardar un
            reel en tu galería y subirlo aquí; para YouTube basta con la URL.
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
        <>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>URL del Reel de Instagram</label>
            <input
              className="input"
              type="url"
              placeholder="https://www.instagram.com/reel/…"
              value={igUrl}
              onChange={(e) => setIgUrl(e.target.value)}
            />
          </div>

          {companion === true && (
            <>
              <p className="hint" style={{ marginBottom: 10 }}>
                ✅ Compañero detectado en este equipo: puedes analizar el reel ahora mismo.
              </p>
              <div className="settings-row">
                <button className="btn primary" disabled={!igValid} onClick={analyzeNow}>
                  ✨ Analizar ahora
                </button>
                <button className="btn" disabled={!igValid} onClick={addToQueue}>
                  ➕ A la cola
                </button>
              </div>
            </>
          )}

          {companion === false && (
            <>
              <div className="info-box">
                📱 <strong>Guardado en este dispositivo.</strong> Aquí no se puede descargar de
                Instagram, así que el reel se guarda en la cola y se procesa en tu PC (con el
                compañero abierto). Comparte un reel desde Instagram a Bibliotheke, o pega su URL
                arriba.
              </div>
              <div className="settings-row" style={{ marginTop: 10 }}>
                <button className="btn primary" disabled={!igValid} onClick={addToQueue}>
                  ➕ Guardar reel en la cola
                </button>
              </div>
            </>
          )}

          {companion === null && (
            <p className="hint">Buscando el compañero local…</p>
          )}

          {notice && <div className="ok-box" style={{ marginTop: 12 }}>{notice}</div>}
          {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}

          {batchResult && (
            <div className={batchResult.errors.length ? 'error-box' : 'ok-box'} style={{ marginTop: 12 }}>
              <div>
                {batchResult.ok > 0 ? `✓ ${batchResult.ok} reel(s) convertidos en fichas.` : 'No se procesó ningún reel.'}
                {batchResult.errors.length > 0 && ` ${batchResult.errors.length} con error (siguen en la cola):`}
              </div>
              {batchResult.errors.length > 0 && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                  {batchResult.errors.map((e, i) => (
                    <li key={i} style={{ fontSize: 13 }}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {queue.length > 0 && (
            <div className="section" style={{ marginTop: 20 }}>
              <h2>Reels en cola ({queue.length})</h2>
              <ul className="queue-list">
                {queue.map((r) => (
                  <li className="queue-item" key={r.url}>
                    <span className="queue-code">reel/{shortcodeOf(r.url)}</span>
                    <button className="queue-remove" title="Quitar" onClick={() => removeFromQueue(r.url)}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              {companion === true ? (
                <button className="btn primary" style={{ marginTop: 12 }} onClick={processQueue}>
                  ⚡ Procesar {queue.length} reel(s) en este PC
                </button>
              ) : (
                <>
                  <button className="btn primary" style={{ marginTop: 12 }} onClick={sendToPc}>
                    📤 Enviar {queue.length} reel(s) al PC
                  </button>
                  <p className="hint" style={{ marginTop: 8 }}>
                    Genera un enlace con esta cola (y tu biblioteca). Ábrelo en tu PC con el compañero
                    en marcha y pulsa «Procesar».
                  </p>
                </>
              )}
              {linkOut && (
                <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
                  <label>Copia el enlace a mano:</label>
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
          )}
        </>
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

      {mode !== 'instagram' && error && <div className="error-box">{error}</div>}

      {mode !== 'instagram' && (
        <button className="btn primary" style={{ width: '100%', marginTop: 8 }} disabled={!input} onClick={run}>
          ✨ Extraer conocimiento
        </button>
      )}
    </div>
  );
}
