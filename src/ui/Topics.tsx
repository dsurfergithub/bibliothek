import { useMemo } from 'react';
import type { KnowledgeCard } from '../domain/types';
import { IconChevron, IconEye, IconTopics } from './icons';

export const TODOS = '__todos__';

/** Un tema = una categoría del análisis, con cuántas fichas has visto ya. */
export interface Topic {
  id: string;
  nombre: string;
  total: number;
  vistas: number;
}

export function topicsOf(cards: KnowledgeCard[]): Topic[] {
  const map = new Map<string, Topic>();
  for (const c of cards) {
    const nombre = c.categoria?.trim() || 'Sin tema';
    const t = map.get(nombre) ?? { id: nombre, nombre, total: 0, vistas: 0 };
    t.total++;
    if (c.vistoAt) t.vistas++;
    map.set(nombre, t);
  }
  // Los temas con más pendientes primero: es donde hay trabajo.
  return [...map.values()].sort((a, b) => b.total - b.vistas - (a.total - a.vistas) || a.nombre.localeCompare(b.nombre));
}

export function cardsOfTopic(cards: KnowledgeCard[], id: string): KnowledgeCard[] {
  if (id === TODOS) return cards;
  return cards.filter((c) => (c.categoria?.trim() || 'Sin tema') === id);
}

/**
 * Menú de temas: una tarjeta por categoría con su progreso de lectura.
 * Tocar una abre el mazo (`Deck`) con las fichas pendientes de ver.
 */
export function Topics({ cards, onOpen }: { cards: KnowledgeCard[]; onOpen: (id: string) => void }) {
  const topics = useMemo(() => topicsOf(cards), [cards]);
  const vistas = cards.filter((c) => c.vistoAt).length;
  const pendientes = cards.length - vistas;

  if (cards.length === 0) {
    return (
      <div className="empty-state">
        <h2>Sin temas todavía</h2>
        <p>Cuando guardes fichas, aquí aparecerán agrupadas por tema para repasarlas una a una.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="topics-top">
        <div>
          <h1 className="view-title">Temas</h1>
          <p className="hint topics-lede">
            Pasa las fichas de un tema como si fueran cartas: derecha si ya la has visto, izquierda para dejarla para
            luego.
          </p>
        </div>
      </div>

      <button className="topic-all" onClick={() => onOpen(TODOS)} disabled={pendientes === 0}>
        <span className="topic-all-icon">
          <IconTopics size={20} />
        </span>
        <span className="topic-all-txt">
          <span className="topic-name">Todas las pendientes</span>
          <span className="topic-sub">
            {pendientes === 0 ? 'Lo has visto todo' : `${pendientes} sin ver de ${cards.length}`}
          </span>
        </span>
        <IconChevron size={16} className="row-chevron" />
      </button>

      <ul className="topic-grid">
        {topics.map((t) => {
          const pct = t.total ? Math.round((t.vistas / t.total) * 100) : 0;
          const done = t.vistas === t.total;
          return (
            <li key={t.id}>
              <button className={`topic-card ${done ? 'done' : ''}`} onClick={() => onOpen(t.id)}>
                <span className="topic-name">{t.nombre}</span>
                <span className="topic-count">
                  <span className="n">{t.vistas}</span>
                  <span className="of">/{t.total}</span>
                  {done && <IconEye size={13} />}
                </span>
                <span className="topic-bar" aria-hidden="true">
                  <span style={{ width: `${pct}%` }} />
                </span>
                <span className="topic-sub">{done ? 'Todo visto' : `${t.total - t.vistas} por ver`}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
