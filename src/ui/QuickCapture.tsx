import { useEffect, useState } from 'react';
import type { KnowledgeCard } from '../domain/types';
import { enqueueMany, extractAllInstagramUrls, listQueue, shortcodeOf } from '../services/queue';
import { IconAdd, IconClose } from './icons';

const YT = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?[^\s]*v=|shorts\/)|youtu\.be\/)[\w-]{11}[^\s]*/;

/**
 * Lee lo copiado en todos sus formatos de texto. Instagram, en el iPhone, copia
 * el enlace como URL (`text/uri-list`) y no como texto plano: `readText()` lo
 * devuelve vacío. Por eso se mira cada formato con `read()` y solo si eso no
 * existe o falla se cae a `readText()`.
 */
async function leerPortapapeles(): Promise<string> {
  const textos: string[] = [];
  if (navigator.clipboard.read) {
    try {
      for (const item of await navigator.clipboard.read()) {
        for (const tipo of ['text/plain', 'text/uri-list', 'text/html']) {
          if (item.types.includes(tipo)) textos.push(await (await item.getType(tipo)).text());
        }
      }
      if (textos.join('').trim()) return textos.join('\n');
    } catch {
      // Sigue con readText.
    }
  }
  return navigator.clipboard.readText();
}

/** ¿Este navegador deja leer el portapapeles con un toque? */
export const canPaste = () => typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;

/**
 * Captura rápida desde el portapapeles: lo más cerca que puede estar una web
 * instalada en el iPhone del menú Compartir, que iOS no le deja usar.
 *
 * En Instagram: Compartir → Copiar enlace. En Bibliothek: «Pegar reel». Un
 * toque (más el globo «Pegar» que iOS muestra por privacidad) y el reel queda
 * en la cola. Un enlace de YouTube abre Añadir con la URL ya puesta.
 *
 * Una web no puede mirar el portapapeles sin que la toques, así que la barra no
 * sabe si hay algo copiado: se destaca al volver a la app, que es justo cuando
 * vienes de copiar un enlace.
 */
export function QuickCapture({
  cards,
  destacada,
  onDismiss,
  onQueued,
  onYoutube,
}: {
  cards: KnowledgeCard[];
  /** Acabas de volver a la app: la barra se ofrece con más presencia. */
  destacada: boolean;
  onDismiss: () => void;
  onQueued: () => void;
  onYoutube: (url: string) => void;
}) {
  const [msg, setMsg] = useState<{ kind: 'ok' | 'info' | 'error'; text: string } | null>(null);
  /** Si leer el portapapeles no funciona, un campo donde pegar a mano (mantener pulsado → Pegar). */
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (!msg || msg.kind === 'error') return;
    const t = setTimeout(() => setMsg(null), 6000);
    return () => clearTimeout(t);
  }, [msg]);

  async function pegar() {
    let text = '';
    try {
      text = (await leerPortapapeles()).trim();
    } catch {
      text = '';
    }
    if (!text) {
      // iOS no lo ha dado (permiso denegado o un formato que no expone): pegar a mano siempre funciona.
      setManual(true);
      return;
    }
    procesar(text);
  }

  function procesar(text: string) {
    const reels = extractAllInstagramUrls(text);
    if (reels.length > 0) {
      const fichados = new Set(
        cards.filter((c) => c.fuente.tipo === 'instagram').map((c) => shortcodeOf(c.fuente.referencia))
      );
      const yaFicha = reels.filter((u) => fichados.has(shortcodeOf(u)));
      const nuevos = reels.filter((u) => !fichados.has(shortcodeOf(u)));
      const n = nuevos.length ? enqueueMany(nuevos.join('\n')) : 0;
      setManual(false);
      onDismiss();
      if (n > 0) {
        onQueued();
        const total = listQueue().length;
        setMsg({
          kind: 'ok',
          text: `${n === 1 ? 'Reel guardado' : `${n} reels guardados`} en la cola · ${total} en total.`,
        });
      } else if (yaFicha.length) {
        setMsg({ kind: 'info', text: 'Ya tienes una ficha de ese reel.' });
      } else {
        setMsg({ kind: 'info', text: 'Ese reel ya estaba en la cola.' });
      }
      return;
    }
    const yt = YT.exec(text);
    if (yt) {
      setManual(false);
      onDismiss();
      onYoutube(yt[0]);
      return;
    }
    setMsg({
      kind: 'error',
      text: text
        ? 'Lo copiado no es un enlace de Instagram ni de YouTube.'
        : 'No hay nada copiado. En Instagram: Compartir → Copiar enlace.',
    });
  }

  if (manual) {
    return (
      <div className="quick-capture manual">
        <label className="qc-text" htmlFor="qc-manual">
          No he podido leer lo copiado. Mantén pulsado el campo y elige <strong>Pegar</strong>:
        </label>
        <div className="qc-manual-row">
          <input
            id="qc-manual"
            className="input"
            type="url"
            inputMode="url"
            placeholder="https://www.instagram.com/reel/…"
            autoFocus
            onChange={(e) => e.target.value.trim() && procesar(e.target.value.trim())}
          />
          <button
            className="qc-close"
            onClick={() => {
              setManual(false);
              setMsg(null);
            }}
            aria-label="Cancelar"
          >
            <IconClose size={15} />
          </button>
        </div>
        {msg && <p className={`qc-manual-msg ${msg.kind}`}>{msg.text}</p>}
      </div>
    );
  }

  if (msg) {
    return (
      <div className={`quick-capture done ${msg.kind}`} role="status">
        <span className="qc-text">{msg.text}</span>
        <button className="qc-close" onClick={() => setMsg(null)} aria-label="Cerrar aviso">
          <IconClose size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className={`quick-capture ${destacada ? 'destacada' : ''}`}>
      <span className="qc-text">
        {destacada ? '¿Has copiado un reel? Guárdalo en un toque.' : 'Enlace de Instagram o YouTube copiado'}
      </span>
      <button className="btn small primary qc-btn" onClick={pegar}>
        <IconAdd size={15} /> Pegar reel
      </button>
      {destacada && (
        <button className="qc-close" onClick={onDismiss} aria-label="Ocultar">
          <IconClose size={15} />
        </button>
      )}
    </div>
  );
}
