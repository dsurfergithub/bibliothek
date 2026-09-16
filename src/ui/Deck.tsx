import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { sourceUrl, type KnowledgeCard } from '../domain/types';
import { setVisto } from '../services/db';
import { IconBack, IconChevron, IconExternal, IconEye, IconSnooze, SourceIcon, Stars } from './icons';
import { TODOS, cardsOfTopic } from './Topics';

type Dir = 'left' | 'right';

/** A partir de cuántos píxeles de arrastre un gesto cuenta como decisión. */
const UMBRAL = 96;
/** Movimiento máximo para que un toque siga siendo un toque (y no un arrastre). */
const TAP = 8;
const SALIDA_MS = 280;

/**
 * Mazo de fichas de un tema, al estilo Tinder: la de arriba se arrastra con el
 * dedo. Derecha = «vista» (se guarda en la ficha); izquierda = «luego» (vuelve
 * al final del mazo sin tocar nada). Solo entran las fichas sin ver.
 *
 * Toda la mecánica va con Pointer Events y `touch-action: pan-y`: el arrastre
 * horizontal es nuestro y el vertical sigue siendo scroll del navegador (cuando
 * Safari decide que es scroll manda `pointercancel` y soltamos la carta).
 */
export function Deck({
  topicId,
  cards,
  onBack,
  onOpenCard,
  onChanged,
}: {
  topicId: string;
  cards: KnowledgeCard[];
  onBack: () => void;
  onOpenCard: (id: string) => void;
  onChanged: (card: KnowledgeCard) => void;
}) {
  const nombre = topicId === TODOS ? 'Todas las pendientes' : topicId;

  // El orden del mazo se fija al entrar: si la lista de fichas se refresca al
  // marcar una, no queremos que la siguiente cambie de sitio bajo el dedo.
  const [orden, setOrden] = useState<string[]>(() =>
    cardsOfTopic(cards, topicId)
      .filter((c) => !c.vistoAt)
      .map((c) => c.id)
  );
  const total = useRef(orden.length);
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const mazo = orden.map((id) => byId.get(id)).filter((c): c is KnowledgeCard => Boolean(c));
  const top = mazo[0];
  const vistas = total.current - mazo.length;

  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [saliendo, setSaliendo] = useState<Dir | null>(null);
  const [animando, setAnimando] = useState(false);
  const drag = useRef<{ id: number; x0: number; y0: number; moved: boolean } | null>(null);
  /** El último gesto fue un arrastre: el `click` que llega justo después no cuenta. */
  const arrastro = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  /** Ejecuta la decisión: saca la carta y luego actualiza el mazo. */
  const decidir = useCallback(
    (dir: Dir) => {
      if (!top || saliendo) return;
      setSaliendo(dir);
      setAnimando(true);
      window.setTimeout(async () => {
        if (dir === 'right') onChanged(await setVisto(top, true));
        setOrden((o) => (dir === 'right' ? o.filter((id) => id !== top.id) : [...o.slice(1), o[0]]));
        setSaliendo(null);
        setDx(0);
        setDy(0);
        // La carta nueva aparece sin transición: si no, «vuelve» desde fuera.
        requestAnimationFrame(() => setAnimando(false));
      }, SALIDA_MS);
    },
    [top, saliendo, onChanged]
  );

  function onDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (saliendo || e.button !== 0) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
    arrastro.current = false;
    setAnimando(false);
  }

  function onMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const x = e.clientX - d.x0;
    const y = e.clientY - d.y0;
    if (!d.moved && Math.hypot(x, y) > TAP) {
      d.moved = true;
      cardRef.current?.setPointerCapture(e.pointerId);
    }
    if (d.moved) {
      setDx(x);
      setDy(y * 0.25);
    }
  }

  function onUp(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    arrastro.current = true;
    if (Math.abs(dx) > UMBRAL) decidir(dx > 0 ? 'right' : 'left');
    else {
      setAnimando(true);
      setDx(0);
      setDy(0);
    }
  }

  function onCancel() {
    drag.current = null;
    setAnimando(true);
    setDx(0);
    setDy(0);
  }

  // Un arrastre no debe disparar el botón/enlace sobre el que empezó.
  function guardClick(e: ReactMouseEvent) {
    if (arrastro.current || saliendo) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') decidir('right');
      if (e.key === 'ArrowLeft') decidir('left');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decidir]);

  const x = saliendo ? (saliendo === 'right' ? 1 : -1) * (window.innerWidth + 200) : dx;
  const rot = saliendo ? (saliendo === 'right' ? 18 : -18) : dx * 0.06;
  const peso = Math.min(1, Math.abs(dx) / UMBRAL);

  return (
    <div className="deck-view">
      <button className="btn ghost back" onClick={onBack}>
        <IconBack size={17} /> Temas
      </button>

      <div className="deck-head">
        <h1 className="view-title">{nombre}</h1>
        <span className="deck-count" aria-live="polite">
          {mazo.length === 0 ? `${total.current} vistas` : `${vistas + 1} de ${total.current}`}
        </span>
      </div>

      {!top ? (
        <div className="deck-empty spring-in">
          <span className="done-mark">
            <IconEye size={28} />
          </span>
          <h2 className="done-title">Nada pendiente en {topicId === TODOS ? 'ningún tema' : 'este tema'}</h2>
          <p className="done-sub">
            {total.current === 0
              ? 'Ya tenías todas las fichas vistas.'
              : `Has repasado ${total.current} ficha${total.current === 1 ? '' : 's'}. Las tienes en la biblioteca con su sello.`}
          </p>
          <button className="btn" onClick={onBack}>
            Volver a temas
          </button>
        </div>
      ) : (
        <>
          <div className="deck-stage">
            {mazo
              .slice(0, 3)
              .reverse()
              .map((card, i, arr) => {
                const depth = arr.length - 1 - i; // 0 = arriba
                if (depth > 0) {
                  return (
                    <div
                      key={card.id}
                      className="deck-card behind"
                      aria-hidden="true"
                      style={{ transform: `translateY(${depth * 12}px) scale(${1 - depth * 0.045})` }}
                    >
                      <span className="deck-cat">{card.categoria}</span>
                      <h2 className="deck-title">{card.titulo}</h2>
                    </div>
                  );
                }
                const url = sourceUrl(card);
                return (
                  <div
                    key={card.id}
                    ref={cardRef}
                    className={`deck-card top ${animando ? 'anim' : ''}`}
                    style={{ transform: `translate(${x}px, ${dy}px) rotate(${rot}deg)` }}
                    onPointerDown={onDown}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onCancel}
                    onClickCapture={guardClick}
                  >
                    <span className="deck-stamp si" style={{ opacity: dx > 0 ? peso : 0 }} aria-hidden="true">
                      <IconEye size={16} /> Vista
                    </span>
                    <span className="deck-stamp luego" style={{ opacity: dx < 0 ? peso : 0 }} aria-hidden="true">
                      <IconSnooze size={16} /> Luego
                    </span>

                    <span className="deck-src">
                      <SourceIcon tipo={card.fuente.tipo} size={14} />
                      <span className="deck-cat">{card.categoria}</span>
                      <Stars value={Math.round((card.evaluacion?.utilidad ?? 0) / 2)} />
                    </span>
                    <h2 className="deck-title">{card.titulo}</h2>
                    <p className="deck-idea">{card.ideaPrincipal}</p>
                    <p className="deck-summary">{card.resumenCorto}</p>

                    <div className="deck-links">
                      {url && (
                        <a className="btn small" href={url} target="_blank" rel="noopener noreferrer" draggable={false}>
                          <IconExternal size={15} /> Ver original
                        </a>
                      )}
                      <button className="btn ghost small" onClick={() => onOpenCard(card.id)}>
                        Abrir ficha <IconChevron size={14} className="row-chevron" />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="deck-actions" role="group" aria-label="Decidir sobre la ficha">
            <button className="btn deck-btn luego" onClick={() => decidir('left')} disabled={Boolean(saliendo)}>
              <IconSnooze size={18} /> Luego
            </button>
            <button className="btn primary deck-btn" onClick={() => decidir('right')} disabled={Boolean(saliendo)}>
              <IconEye size={18} /> Vista
            </button>
          </div>
          <p className="deck-legend hint">Desliza la carta o usa los botones · ← →</p>
        </>
      )}
    </div>
  );
}
