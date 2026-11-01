import { useEffect, useState } from 'react';
import type { KnowledgeCard } from '../domain/types';
import { enqueueMany, extractAllInstagramUrls, listQueue, shortcodeOf } from '../services/queue';
import { IconAdd, IconClose } from './icons';

const YT = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?[^\s]*v=|shorts\/)|youtu\.be\/)[\w-]{11}[^\s]*/;

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

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 6000);
    return () => clearTimeout(t);
  }, [msg]);

  async function pegar() {
    let text = '';
    try {
      text = (await navigator.clipboard.readText()).trim();
    } catch {
      setMsg({ kind: 'error', text: 'No se pudo leer lo copiado. Pega el enlace a mano en Añadir → Instagram.' });
      return;
    }
    const reels = extractAllInstagramUrls(text);
    if (reels.length > 0) {
      const fichados = new Set(
        cards.filter((c) => c.fuente.tipo === 'instagram').map((c) => shortcodeOf(c.fuente.referencia))
      );
      const yaFicha = reels.filter((u) => fichados.has(shortcodeOf(u)));
      const nuevos = reels.filter((u) => !fichados.has(shortcodeOf(u)));
      const n = nuevos.length ? enqueueMany(nuevos.join('\n')) : 0;
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
