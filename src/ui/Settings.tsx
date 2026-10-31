import { useEffect, useRef, useState } from 'react';
import { getApiKey, getModel, MODELS, setApiKey, setModel, validateApiKey } from '../services/apiKey';
import { clearAll, emptyTrash, listTrash, restoreCard, type TrashEntry } from '../services/db';
import { downloadText } from '../services/exporters';
import {
  buildSyncLinks,
  changesSince,
  lastSyncOut,
  loadSnapshot,
  markSyncOut,
  rawTransferOf,
  snapshotSize,
} from '../services/sync';
import { copyLink, shareOrCopyLink } from '../services/share';
import { listQueue } from '../services/queue';
import { applyTransfer, describePlan, describeSkipped, planHasChanges, planTransfer } from '../services/transfer';
import { IconDownload, IconLink, IconShare, IconTrash, IconUpload } from './icons';

/** Los días que se muestran como «hace N días» en la papelera. */
const DIA = 86_400_000;

export function Settings({ onLibraryChanged }: { onLibraryChanged: () => void }) {
  const [key, setKey] = useState('');
  const [model, setModelState] = useState(getModel());
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [linkOut, setLinkOut] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const [ultimoEnvio, setUltimoEnvio] = useState(() => lastSyncOut());
  const [novedades, setNovedades] = useState<{ cards: number; steps: number } | null>(null);
  const [papelera, setPapelera] = useState<TrashEntry[]>([]);
  const refreshTrash = () => void listTrash().then(setPapelera);
  useEffect(refreshTrash, []);
  /** Feedback de los botones de enlace, pintado junto a ellos (no arriba de la página). */
  const [syncMsg, setSyncMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  /**
   * Enlaces YA generados al entrar en Ajustes. iOS Safari solo deja compartir o
   * copiar dentro del toque: si el botón tuviera que leer la BD y comprimir
   * antes, el gesto caducaría y no pasaría nada. Así el toque no espera nada.
   */
  const [prep, setPrep] = useState<{
    full: { links: string[]; cards: number; total: number };
    inc: { links: string[]; cards: number; total: number } | null;
    nReels: number;
  } | null>(null);
  /** Partes ya copiadas/enviadas de un envío en varios enlaces (ver `buildSyncLinks`). */
  const [parteState, setParteState] = useState<{ inc: boolean; i: number }>({ inc: true, i: 0 });

  // Cuánto habría que mandar si enviases ahora solo lo nuevo, y los enlaces listos.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const snap = await loadSnapshot();
      const d = ultimoEnvio > 0 ? changesSince(snap, ultimoEnvio) : null;
      const [full, inc] = await Promise.all([
        buildSyncLinks(snap, 0),
        d ? buildSyncLinks(snap, ultimoEnvio) : Promise.resolve(null),
      ]);
      if (!vivo) return;
      setNovedades(d ? { cards: d.cards.length, steps: d.steps.length } : null);
      setParteState({ inc: true, i: 0 });
      setPrep({
        full: { links: full, cards: snap.cards.length, total: snapshotSize(snap) },
        inc: d && inc ? { links: inc, cards: d.cards.length, total: snapshotSize(d) } : null,
        nReels: listQueue().length,
      });
    })().catch(() => {
      if (vivo) setSyncMsg({ kind: 'error', text: 'No se pudo generar el enlace.' });
    });
    return () => {
      vivo = false;
    };
  }, [ultimoEnvio, papelera.length]);

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

  /** Descarga una copia de seguridad completa: fichas, pasos, caminos, borrados y cola de reels. */
  async function exportLibrary() {
    const snap = await loadSnapshot();
    const queue = listQueue();
    downloadText(
      `bibliotheke-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ app: 'bibliotheke', version: 3, ...snap, queue }, null, 2),
      'application/json'
    );
    setMsg({ kind: 'ok', text: 'Copia de seguridad descargada. Guárdala en un sitio seguro.' });
  }

  /**
   * Carga una copia (o la exportación del PC): primero valida y enseña qué
   * cambiaría; solo si confirmas, lo funde sin borrar nada de lo que ya haya.
   */
  async function importLibrary(file: File) {
    setMsg(null);
    let plan;
    try {
      plan = await planTransfer(rawTransferOf(JSON.parse(await file.text())));
    } catch {
      setMsg({ kind: 'error', text: 'El archivo no es una copia válida de Bibliotheke.' });
      return;
    }
    const omitidas = describeSkipped(plan);
    if (!planHasChanges(plan)) {
      setMsg({ kind: 'ok', text: ['Esa copia no trae nada nuevo: ya tienes todo lo que contiene.', ...omitidas].join(' ') });
      return;
    }
    const ok = confirm(
      [
        'Esta copia trae:',
        ...describePlan(plan).map((c) => `• ${c}`),
        ...(omitidas.length ? ['', ...omitidas] : []),
        '',
        '¿Cargarla? Lo demás se conserva.',
      ].join('\n')
    );
    if (!ok) return;
    const { limpiados } = await applyTransfer(plan);
    onLibraryChanged();
    refreshTrash();
    const partes = describePlan(plan);
    if (limpiados) partes.push(`${limpiados} reel${limpiados === 1 ? '' : 's'} ya procesado${limpiados === 1 ? '' : 's'} fuera de la cola`);
    setMsg({ kind: 'ok', text: `Copia cargada: ${partes.join(', ')}. Nada de lo que ya tenías se ha perdido.` });
  }

  async function restore(id: string) {
    const card = await restoreCard(id);
    refreshTrash();
    onLibraryChanged();
    if (card) setMsg({ kind: 'ok', text: `«${card.titulo}» ha vuelto a tu biblioteca.` });
  }

  async function vaciarPapelera() {
    if (!confirm('Las fichas de la papelera se borrarán para siempre de este dispositivo. ¿Continuar?')) return;
    await emptyTrash();
    refreshTrash();
  }

  /**
   * Copia o comparte el enlace ya preparado (`prep`). Con `incremental`, solo
   * viaja lo cambiado desde el último envío: es lo que evita que el enlace
   * crezca sin parar hasta pasarse del límite de las apps de mensajería.
   * Sin ningún `await` antes de compartir/copiar: ver `prep`.
   */
  async function syncLink(viaShare: boolean, incremental: boolean) {
    setSyncMsg(null);
    setLinkOut(null);
    if (!prep) {
      setSyncMsg({ kind: 'error', text: 'Preparando el enlace… vuelve a pulsar en un segundo.' });
      return;
    }
    const desde = incremental ? ultimoEnvio : 0;
    const sel = desde > 0 && prep.inc ? prep.inc : prep.full;

    if (sel.total === 0 && prep.nReels === 0) {
      setSyncMsg({
        kind: 'error',
        text:
          desde > 0
            ? 'No hay novedades desde tu último envío.'
            : 'No hay fichas ni reels en cola: no hay nada que enviar.',
      });
      return;
    }

    const n = sel.links.length;
    // El contador de partes es de UN envío: cambiar de «lo nuevo» a «todo» lo reinicia.
    const i = parteState.inc === incremental ? Math.min(parteState.i, n - 1) : 0;
    const link = sel.links[i];
    const ultima = i === n - 1;
    const resumen = [
      sel.cards ? `${sel.cards} ficha${sel.cards === 1 ? '' : 's'}` : '',
      prep.nReels ? `${prep.nReels} reel${prep.nReels === 1 ? '' : 's'} en cola` : '',
    ]
      .filter(Boolean)
      .join(' + ');

    const ahora = Date.now();
    const outcome = viaShare ? await shareOrCopyLink('Bibliotheke', link) : await copyLink(link);
    if (outcome === 'cancelled') return;
    if (outcome === 'manual') {
      // Sin permiso de portapapeles: se muestra para copiarlo a mano. No se
      // marca como enviado porque no sabemos si llegó a copiarlo.
      setLinkOut(link);
      return;
    }
    const verbo = outcome === 'shared' ? 'enviado' : 'copiado';
    if (n === 1) {
      markSyncOut(ahora);
      setUltimoEnvio(ahora);
      setSyncMsg({
        kind: 'ok',
        text: `Enlace ${verbo} (${resumen}). Ábrelo en el otro dispositivo para cargarlo.`,
      });
      return;
    }
    // Varios enlaces: solo cuenta como enviado cuando ha salido la última parte.
    if (ultima) {
      markSyncOut(ahora);
      setUltimoEnvio(ahora);
      setSyncMsg({ kind: 'ok', text: `Parte ${n} de ${n} (última) ${verbo === 'enviado' ? 'enviada' : 'copiada'}. Con esta, ${resumen} en total.` });
      return;
    }
    setParteState({ inc: incremental, i: i + 1 });
    setSyncMsg({
      kind: 'ok',
      text: `Parte ${i + 1} de ${n} ${verbo === 'enviado' ? 'enviada' : 'copiada'}. Ábrela en el otro dispositivo y vuelve a pulsar para la parte ${i + 2}.`,
    });
  }

  async function wipe() {
    if (!confirm('Esto borrará TODAS las fichas de este dispositivo. ¿Continuar?')) return;
    await clearAll();
    onLibraryChanged();
    refreshTrash();
    setMsg({ kind: 'ok', text: 'Biblioteca vaciada.' });
  }

  // Enlaces que tocará copiar para el envío que hacen los botones principales.
  const partes = prep ? (ultimoEnvio > 0 && prep.inc ? prep.inc : prep.full).links.length : 1;
  const parte = parteState.inc ? parteState.i : 0;

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
        {partes > 1 && (
          <p className="hint" style={{ marginTop: 8 }}>
            {ultimoEnvio > 0 ? 'Lo nuevo' : 'Tu biblioteca'} no cabe en un enlace: va en <strong>{partes} partes</strong>.
            Copia o envía una, ábrela en el otro dispositivo y vuelve a pulsar para la siguiente. El orden da igual.
          </p>
        )}
        <div className="settings-row" style={{ marginTop: 10 }}>
          <button className="btn primary" onClick={() => syncLink(false, true)}>
            <IconLink size={16} />{' '}
            {partes > 1
              ? `Copiar parte ${Math.min(parte, partes - 1) + 1} de ${partes}`
              : ultimoEnvio > 0
                ? 'Copiar lo nuevo'
                : 'Copiar enlace'}
          </button>
          {'share' in navigator && (
            <button className="btn" onClick={() => syncLink(true, true)}>
              <IconShare size={16} /> {partes > 1 ? `Enviar parte ${Math.min(parte, partes - 1) + 1}` : 'Enviar'}
            </button>
          )}
          {ultimoEnvio > 0 && (
            <button className="btn" onClick={() => syncLink(false, false)}>
              Copiar todo
            </button>
          )}
        </div>
        {syncMsg && (
          <div className={syncMsg.kind === 'ok' ? 'ok-box' : 'error-box'} style={{ marginTop: 12 }}>
            {syncMsg.text}
          </div>
        )}
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
          almacenamiento si pasas días sin abrir la app. La copia incluye <strong>fichas, micropasos, caminos,
          borrados y cola de reels</strong>. Para restaurarla (o cargar la copia del PC), pulsa «Cargar
          copia»: verás qué trae antes de confirmar, y se funde sin borrar lo que ya tengas.
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
        <h2>Papelera</h2>
        {papelera.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            Vacía. Las fichas que elimines quedan aquí hasta que las restaures o vacíes la papelera.
          </p>
        ) : (
          <>
            <p className="hint">
              Al eliminar una ficha, el borrado también viaja en el enlace y en la copia: así no reaparece al cargar
              una copia antigua. Si la restauras, vuelve en los dos dispositivos.
            </p>
            <ul className="trash-list">
              {papelera.map((t) => (
                <li key={t.id}>
                  <span className="trash-title">{t.card?.titulo}</span>
                  <span className="trash-when">{haceDias(t.deletedAt)}</span>
                  <button className="btn" onClick={() => restore(t.id)}>
                    Restaurar
                  </button>
                </li>
              ))}
            </ul>
            <div className="settings-row" style={{ marginTop: 10 }}>
              <button className="btn danger" onClick={vaciarPapelera}>
                <IconTrash size={16} /> Vaciar papelera
              </button>
            </div>
          </>
        )}
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

function haceDias(ts: number): string {
  const d = Math.floor((Date.now() - ts) / DIA);
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
}
