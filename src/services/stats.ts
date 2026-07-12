import type { KnowledgeCard } from '../domain/types';

/**
 * Registro local de "compartidos": cada vez que el usuario copia, descarga o
 * comparte una ficha se anota aquí (localStorage). Alimenta la vista Insights
 * para saber qué tipo de conocimiento no solo se guarda, sino que se USA.
 */

const KEY = 'bibliotheke.shares';

export interface ShareEvent {
  cardId: string;
  categoria: string;
  tipo: string;
  ts: number;
}

export function recordShare(card: KnowledgeCard): void {
  const events = listShares();
  events.push({ cardId: card.id, categoria: card.categoria, tipo: card.fuente.tipo, ts: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(events.slice(-500)));
}

export function listShares(): ShareEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as ShareEvent[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
