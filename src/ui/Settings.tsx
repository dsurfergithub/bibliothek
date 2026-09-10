import { useEffect, useRef, useState } from 'react';
import { getApiKey, getModel, MODELS, setApiKey, setModel, validateApiKey } from '../services/apiKey';
import { clearAll, importCards, listCards } from '../services/db';
import { downloadText } from '../services/exporters';
import { buildSyncLink, changesSince, lastSyncOut, markSyncOut } from '../services/sync';
import { listQueue, mergeQueue, pruneQueueByCards } from '../services/queue';
import { importSteps, listSteps } from '../services/steps';
import type { KnowledgeCard } from '../domain/types';
import { IconDownload, IconLink, IconShare, IconUpload } from './icons';

export function Settings({ onLibraryChanged }: { onLibraryChanged: () => void }) {
  const [key, setKey] = useState('');
  const [model, setModelState] = useState(getModel());
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [linkOut, setLinkOut] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const [ultimoEnvio, setUltimoEnvio] = useState(() => lastSyncOut());
  const [novedades, setNovedades] = useState<{ cards: number; steps: number } | null>(null);

  // Cuánto habría que mandar si enviases ahora solo lo nuevo.
  useEffect(() => {
    if (ultimoEnvio <= 0) {
      setNovedades(null);
      return;
    }
    let vivo = true;
    Promise.all([listCards(), listSteps()]).then(([c, st]) => {
      if (!vivo) return;
      const d = changesSince(c, st, ultimoEnvio);
      setNovedades({ cards: d.cards.length, steps: d.steps.length });
    });
    return () => {
      vivo = false;
    };
  }, [ultimoEnvio]);

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

  /** Descarga una copia de seguridad completa: fichas + cola de reels pendientes. */
  async function exportLibrary() {
    const cards = await listCards();
    const steps = await listSteps();
    const queue = listQueue();
    downloadText(
      `bibliotheke-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ app: 'bibliotheke', version: 2, cards, steps, queue }, null, 2),
      'application/json'
    );
    setMsg({ kind: 'ok', text: 'Copia de seguridad descargada. Guárdala en un sitio seguro.' });
  }

  /** Carga una copia (o la exportación del PC): funde sin borrar nada de lo que ya haya. */
  async function importLibrary(file: File) {
    try {
      const data = JSON.parse(await file.text());
      const cards: KnowledgeCard[] = Array.isArray(data) ? data : data.cards;
      if (!Array.isArray(cards)) throw new Error('formato');
      const n = await importCards(cards);
      const p = await importSteps(data?.steps);
      const q = data && Array.isArray(data.queue) ? mergeQueue(data.queue) : 0;
      const limpiados = pruneQueueByCards(cards);
      onLibraryChanged();
      const partes = [`${n} ficha${n === 1 ? '' : 's'}`];
      if (p) partes.push(`${p} micropaso${p === 1 ? '' : 's'}`);
      if (q) partes.push(`${q} reel${q === 1 ? '' : 's'} en cola`);
      if (limpiados) partes.push(`${limpiados} reel${limpiados === 1 ? '' : 's'} ya procesado${limpiados === 1 ? '' : 's'} fuera de la cola`);
      setMsg({ kind: 'ok', text: `Copia cargada: ${partes.join(' y ')}. Nada de lo que ya tenías se ha borrado.` });
    } catch {
      setMsg({ kind: 'error', text: 'El archivo no es una copia válida de Bibliotheke.' });
    }
  }

  /** Genera el enlace #sync= con la biblioteca + la cola y lo copia o comparte. */
  /**
   * Genera el enlace de la biblioteca. Con `incremental`, solo viaja lo cambiado
   * desde el último envío: es lo que evita que el enlace crezca sin parar hasta
   * pasarse del límite de las apps de mensajería.
   */
  async function syncLink(viaShare: boolean, incremental: boolean) {
    setMsg(null);
    setLinkOut(null);
    try {
      const desde = incremental ? lastSyncOut() : 0;
      const cards = await listCards();
      const steps = await listSteps();
      const sel = desde > 0 ? changesSince(cards, steps, desde) : { cards, steps };
      const nReels = listQueue().length;

      if (sel.cards.length === 0 && sel.steps.length === 0 && nReels === 0) {
        setMsg({
          kind: 'error',
          text:
            desde > 0
              ? 'No hay novedades desde tu último envío.'
              : 'No hay fichas ni reels en cola: no hay nada que enviar.',
        });
        return;
      }

      const link = await buildSyncLink(cards, steps, desde);
      // Más allá de ~100k caracteres los enlaces se truncan en apps de mensajería.
      if (link.length > 100_000) {
        setMsg({
          kind: 'error',
          text:
            desde > 0
              ? 'Incluso enviando solo lo nuevo hay demasiado para un enlace. Usa la copia de seguridad de abajo.'
              : 'Tu biblioteca entera no cabe en un enlace. Envía solo lo nuevo, o usa la copia de seguridad de abajo.',
        });
        return;
      }

      const ahora = Date.now();
      if (viaShare && navigator.share) {
        try {
          await navigator.share({ title: 'Bibliotheke', url: link });
          markSyncOut(ahora);
          setUltimoEnvio(ahora);
          return;
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') return;
        }
      }

      const resumen = [
        sel.cards.length ? `${sel.cards.length} ficha${sel.cards.length === 1 ? '' : 's'}` : '',
        nReels ? `${nReels} reel${nReels === 1 ? '' : 's'} en cola` : '',
      ]
        .filter(Boolean)
        .join(' + ');
      try {
        await navigator.clipboard.writeText(link);
        markSyncOut(ahora);
        setUltimoEnvio(ahora);
        setMsg({
          kind: 'ok',
          text: `Enlace copiado (${resumen}). Ábrelo en el otro dispositivo para cargarlo.`,
        });
      } catch {
        // Sin permiso de portapapeles: se muestra para copiarlo a mano. No se
        // marca como enviado porque no sabemos si llegó a copiarlo.
        setLinkOut(link);
      }
    } catch {
      setMsg({ kind: 'error', text: 'No se pudo generar el enlace.' });
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
        <h2>Pasar tus fichas al móvil (enlace)</h2>
        <p className="hint">
          La forma rápida de llevar las fichas que extraes en el PC al móvil (o al revés): genera un
          enlace comprimido y sin la API key. Ábrelo en el otro dispositivo y se carga ahí —{' '}
          <strong>fundiéndose</strong> con lo que ya tengas, sin borrar nada. Envíatelo por WhatsApp,
          Telegram o email.
        </p>
        <p className="hint" style={{ marginTop: 8 }}>
          A partir del segundo envío solo viaja <strong>lo que ha cambiado desde el anterior</strong>,
          así que el enlace se mantiene corto por grande que se haga tu biblioteca. «Copiar todo» está
          ahí para un dispositivo nuevo o si algún envío se perdió por el camino.
        </p>
        <p className="hint" style={{ marginTop: 8 }}>
          Para mandar <strong>solo reels</strong> del móvil al PC no hace falta esto: en{' '}
          <strong>Añadir → Instagram</strong>, el botón «Enviar al PC» genera un enlace corto que
          lleva únicamente la cola, sin la biblioteca, y por tanto nunca se queda largo.
        </p>
        {ultimoEnvio > 0 && (
          <p className="hint" style={{ marginTop: 8 }}>
            Último envío: {new Date(ultimoEnvio).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
            {novedades &&
              ` · ${novedades.cards} ficha${novedades.cards === 1 ? '' : 's'} y ${novedades.steps} paso${
                novedades.steps === 1 ? '' : 's'
              } desde entonces`}
            .
          </p>
        )}
        <div className="settings-row" style={{ marginTop: 10 }}>
          <button className="btn primary" onClick={() => syncLink(false, true)}>
            <IconLink size={16} /> {ultimoEnvio > 0 ? 'Copiar lo nuevo' : 'Copiar enlace'}
          </button>
          {'share' in navigator && (
            <button className="btn" onClick={() => syncLink(true, true)}>
              <IconShare size={16} /> Enviar
            </button>
          )}
          {ultimoEnvio > 0 && (
            <button className="btn" onClick={() => syncLink(false, false)}>
              Copiar todo
            </button>
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
        <h2>Copia de seguridad</h2>
        <p className="hint">
          Tu biblioteca vive solo en este dispositivo (IndexedDB). Descarga de vez en cuando una copia
          en archivo <code>.json</code> — sobre todo en el móvil, donde el navegador puede vaciar el
          almacenamiento si pasas días sin abrir la app. La copia incluye <strong>fichas + cola de
          reels</strong>. Para restaurarla (o cargar la copia del PC), pulsa «Cargar copia»: se funde
          sin borrar lo que ya tengas.
        </p>
        <div className="settings-row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={exportLibrary}>
            <IconDownload size={16} /> Descargar copia de seguridad
          </button>
          <button className="btn" onClick={() => importInput.current?.click()}>
            <IconUpload size={16} /> Cargar copia
          </button>
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
        <div className="settings-row" style={{ marginTop: 14 }}>
          <button className="btn danger" onClick={wipe}>Borrar toda la biblioteca de este dispositivo</button>
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
