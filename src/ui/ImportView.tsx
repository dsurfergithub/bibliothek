import { useEffect, useRef, useState } from 'react';
import { analyze, humanizeError, STAGE_LABELS, type AnalysisInput, type Stage } from '../services/analyzer';
import { getApiKey, getModel } from '../services/apiKey';
import { companionOnline } from '../services/companion';
import { saveCard } from '../services/db';
import {
  buildQueueLink,
  dequeue,
  enqueueMany,
  extractAllInstagramUrls,
  listQueue,
  shortcodeOf,
  type PendingReel,
} from '../services/queue';
import { IconAdd, IconBolt, IconCheck, IconClose, IconFilm, IconShare, SourceIcon } from './icons';
import type { KnowledgeCard } from '../domain/types';

type Mode = 'video' | 'youtube' | 'instagram' | 'texto';

const STAGE_ORDER: Stage[] = ['preparando', 'descargando', 'subiendo', 'procesando', 'analizando', 'guardando'];


interface BatchProgress {
  total: number;
  done: number;
}

export function ImportView({
  startTab,
  initialNotice,
  onSaved,
  onBatchDone,
}: {
  startTab?: 'instagram';
  /** Aviso con el que se entra (p. ej. los reels que acaba de traer un enlace). */
  initialNotice?: string;
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
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null);
  const [drag, setDrag] = useState(false);
  /** null = comprobando; luego true/false según responda el compañero local. */
  const [companion, setCompanion] = useState<boolean | null>(null);
  const [rechecking, setRechecking] = useState(false);
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

  /** Vuelve a preguntar al compañero (tras arrancarlo, sin salir de la pestaña). */
  async function recheckCompanion() {
    setRechecking(true);
    setCompanion(null);
    const ok = await companionOnline();
    setCompanion(ok);
    setRechecking(false);
  }

  // Fuentes con botón único inferior (Instagram tiene sus propios botones).
  const input: AnalysisInput | null =
    mode === 'video' && file
      ? { kind: 'video', file }
      : mode === 'youtube' && /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url.trim())
        ? { kind: 'youtube', url }
        : mode === 'texto' && text.trim().length > 40
          ? { kind: 'texto', text }
          : null;

  // El campo admite una URL o un pegote con muchas: lo que vale es cuántas hay.
  const igUrls = extractAllInstagramUrls(igUrl);
  const igValid = igUrls.length > 0;

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
      const card = await analyze(apiKey, getModel(), { kind: 'instagram', url: igUrls[0] }, setStage);
      await saveCard(card);
      dequeue(igUrls[0]);
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
    const n = enqueueMany(igUrl);
    if (n > 0) {
      setIgUrl('');
      refreshQueue();
      setNotice(n === 1 ? 'Reel guardado en la cola.' : `${n} reels guardados en la cola.`);
    } else {
      setError('No hay ningún reel de Instagram nuevo ahí: o no es válido, o ya está en la cola.');
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

  /**
   * Móvil → PC: enlace con SOLO la cola. Antes metía la biblioteca entera y a
   * partir de unas pocas fichas se pasaba del límite, obligando a exportar un
   * archivo de copia. Ahora son shortcodes de 11 caracteres: siempre cabe.
   */
  async function sendToPc() {
    setError(null);
    setNotice(null);
    setLinkOut(null);
    try {
      const link = buildQueueLink(queue);
      const n = queue.length;
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Bibliotheke — reels para procesar', url: link });
          return;
        } catch (err) {
          // Si el usuario cancela el diálogo no hay nada que hacer; si falla por
          // otro motivo, caemos al portapapeles.
          if ((err as Error)?.name === 'AbortError') return;
        }
      }
      try {
        await navigator.clipboard.writeText(link);
        setNotice(`Enlace con ${n} reel${n === 1 ? '' : 's'} copiado. Ábrelo en el PC con el compañero en marcha.`);
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
        <h2 className="card-h">Analizando…</h2>
        <p className="hint">Gemini está destilando el conocimiento. Suele tardar menos de un minuto.</p>
        <ul className="stages">
          {visibleStages.map((s, i) => (
            <li key={s} className={i < currentIdx ? 'done' : i === currentIdx ? 'current' : ''}>
              <span className="dot">{i < currentIdx && <IconCheck size={11} />}</span>
              {STAGE_LABELS[s]}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <h1 className="view-title">Añadir conocimiento</h1>

      <div className="segmented" role="tablist" aria-label="Tipo de fuente">
        {(
          [
            ['video', 'Vídeo'],
            ['youtube', 'YouTube'],
            ['instagram', 'Instagram'],
            ['texto', 'Texto'],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? 'on' : ''}
            onClick={() => setMode(m)}
          >
            <SourceIcon tipo={m} size={15} />
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
            <span className="icon"><IconFilm size={30} /></span>
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
            <label htmlFor="ig-url">URL del reel — o varias de golpe, una por línea</label>
            <textarea
              id="ig-url"
              className="textarea"
              style={{ minHeight: 82 }}
              placeholder="https://www.instagram.com/reel/…"
              value={igUrl}
              onChange={(e) => setIgUrl(e.target.value)}
            />
            {igUrls.length > 1 && (
              <p className="hint" style={{ marginTop: 6 }}>{igUrls.length} reels detectados.</p>
            )}
          </div>

          {companion === true && (
            <>
              <p className="hint" style={{ marginBottom: 10 }}>
Compañero detectado en este equipo: puedes analizar el reel ahora mismo.
              </p>
              <div className="settings-row">
                <button className="btn primary" disabled={!igValid} onClick={analyzeNow}>
                  <IconAdd size={17} /> Analizar ahora
                </button>
                <button className="btn" disabled={!igValid} onClick={addToQueue}>
                  <IconAdd size={16} /> A la cola
                </button>
              </div>
            </>
          )}

          {companion === false && (
            <>
              <div className="info-box">
                <strong>Este dispositivo no puede descargar de Instagram por sí solo</strong> (ni el
                móvil, ni un PC sin el compañero en marcha). Guarda el reel en la cola y procésalo
                luego en tu PC con el compañero abierto — o descárgalo tú y súbelo en la pestaña
                <strong>Vídeo</strong>, que no necesita nada extra.
              </div>
              <div className="settings-row" style={{ marginTop: 10 }}>
                <button className="btn primary" disabled={!igValid} onClick={addToQueue}>
                  <IconAdd size={17} /> Guardar en la cola
                </button>
                <button className="btn" onClick={recheckCompanion} disabled={rechecking}>
                  {rechecking ? 'Comprobando…' : 'Volver a comprobar'}
                </button>
              </div>

              <details className="companion-help" style={{ marginTop: 12 }}>
                <summary>¿Qué es el «compañero» y cómo lo activo?</summary>
                <div className="hint" style={{ marginTop: 8 }}>
                  <p style={{ marginTop: 0 }}>
                    Solo hace falta para importar reels de Instagram <strong>pegando su URL</strong>.
                    Para YouTube (basta la URL), un vídeo que ya tengas, o texto, <strong>no</strong>{' '}
                    se usa para nada.
                  </p>
                  <p>
                    Instagram no deja descargar desde el navegador (pide login y bloquea el acceso
                    entre webs). Por eso un programita que corre en tu PC —el «compañero»— usa{' '}
                    <code>yt-dlp</code> para bajar el vídeo y dárselo a la app. Una web no puede
                    arrancarlo sola (los navegadores lo prohíben por seguridad), así que lo abres tú
                    una vez:
                  </p>
                  <ol style={{ paddingLeft: 18, margin: '8px 0' }}>
                    <li>Ten <strong>Node 18+</strong> y <strong>yt-dlp</strong> (<code>pip install yt-dlp</code>).</li>
                    <li>Doble clic en <code>companion/start.cmd</code> (o <code>node server.mjs</code>) y deja la ventana abierta.</li>
                    <li>Vuelve aquí y pulsa <strong>🔄 Volver a comprobar</strong>.</li>
                  </ol>
                  <p style={{ marginBottom: 0 }}>
                    Guía completa en la carpeta <code>companion/</code> del proyecto en{' '}
                    <a href="https://github.com/dsurfergithub/bibliothek" target="_blank" rel="noreferrer">
                      GitHub
                    </a>
                    . ¿No quieres instalar nada? Descarga el reel y súbelo en <strong>Vídeo</strong>.
                  </p>
                </div>
              </details>
            </>
          )}

          {companion === null && (
            <p className="hint">
              {rechecking ? 'Comprobando de nuevo…' : 'Buscando el compañero local…'}
            </p>
          )}

          {notice && <div className="ok-box" style={{ marginTop: 12 }}>{notice}</div>}
          {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}

          {batchResult && (
            <div className={batchResult.errors.length ? 'error-box' : 'ok-box'} style={{ marginTop: 12 }}>
              <div>
                {batchResult.ok > 0 ? `${batchResult.ok} reel(s) convertidos en fichas.` : 'No se procesó ningún reel.'}
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
                    <button
                      className="queue-remove"
                      title="Quitar de la cola"
                      aria-label={`Quitar ${shortcodeOf(r.url)} de la cola`}
                      onClick={() => removeFromQueue(r.url)}
                    >
                      <IconClose size={15} />
                    </button>
                  </li>
                ))}
              </ul>
              {companion === true ? (
                <button className="btn primary" style={{ marginTop: 12 }} onClick={processQueue}>
                  <IconBolt size={17} /> Procesar {queue.length} reel(s) en este PC
                </button>
              ) : (
                <>
                  <button className="btn primary" style={{ marginTop: 12 }} onClick={sendToPc}>
                    <IconShare size={17} /> Enviar {queue.length} reel(s) al PC
                  </button>
                  <p className="hint" style={{ marginTop: 8 }}>
                    Genera un enlace corto que lleva solo estos reels — no tu biblioteca, así que no
                    se queda largo por muchos que añadas. Ábrelo en el PC con el compañero en marcha
                    y pulsa «Procesar».
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
          <IconAdd size={18} /> Extraer conocimiento
        </button>
      )}
    </div>
  );
}
