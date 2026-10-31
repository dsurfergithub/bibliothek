import type { KnowledgeCard, LinkRecord, StepRecord, Tombstone } from '../domain/types';
import { normalizeAll, normalizeCard, normalizeLink, normalizeStep, normalizeTombstone } from '../domain/normalize';
import {
  applyTombstones,
  CARD_STORE,
  db,
  importCards,
  importLinks,
  LINK_STORE,
  stamp,
  STEP_STORE,
  TRASH_STORE,
  type TrashEntry,
} from './db';
import { importSteps } from './steps';
import { listQueue, mergeQueue, pruneQueueByCards, shortcodeOf, type PendingReel } from './queue';
import type { RawTransfer } from './sync';

/**
 * Importación en dos tiempos, común al enlace entre dispositivos y a la copia
 * de seguridad:
 *
 * 1. `planTransfer` valida y adapta todo lo que trae (ver `domain/normalize.ts`)
 *    y calcula, sin escribir nada, qué cambiaría aquí.
 * 2. Con esa previsualización delante, `applyTransfer` lo funde.
 *
 * Antes el enlace se ignoraba si solo traía micropasos (lo que pasa cuando en
 * el otro dispositivo solo marcaste pasos como hechos) y se perdía ese avance.
 * Ahora cuenta cualquier cosa que cambie: fichas, pasos, borrados o caminos.
 */

export interface TransferPlan {
  cards: KnowledgeCard[];
  steps: StepRecord[];
  deleted: Tombstone[];
  links: LinkRecord[];
  queue: PendingReel[];
  nuevas: number;
  actualizadas: number;
  /** Fichas que traía pero que borraste aquí después: no vuelven. */
  yaBorradas: number;
  /** Fichas que no se pudieron rescatar (sin id o sin título). */
  invalidas: number;
  pasos: number;
  /** Fichas de aquí que irán a la papelera porque se borraron allí. */
  aPapelera: number;
  caminos: number;
  reels: number;
}

export async function planTransfer(raw: RawTransfer): Promise<TransferPlan> {
  const cards = normalizeAll(raw.cards, normalizeCard);
  const steps = normalizeAll(raw.steps, normalizeStep).ok;
  const deleted = normalizeAll(raw.deleted, normalizeTombstone).ok;
  const links = normalizeAll(raw.links, normalizeLink).ok;
  const queue = raw.queue.filter((r) => r && typeof r.url === 'string' && shortcodeOf(r.url));

  const database = await db();
  const [localCards, localSteps, trash, localLinks] = await Promise.all([
    database.getAll(CARD_STORE) as Promise<KnowledgeCard[]>,
    database.getAll(STEP_STORE) as Promise<StepRecord[]>,
    database.getAll(TRASH_STORE) as Promise<TrashEntry[]>,
    database.getAll(LINK_STORE) as Promise<LinkRecord[]>,
  ]);
  const cardById = new Map(localCards.map((c) => [c.id, c]));
  const stepById = new Map(localSteps.map((s) => [s.id, s]));
  const tombById = new Map(trash.map((t) => [t.id, t.deletedAt]));
  const linkById = new Map(localLinks.map((l) => [l.id, l]));

  let nuevas = 0;
  let actualizadas = 0;
  let yaBorradas = 0;
  for (const c of cards.ok) {
    const tomb = tombById.get(c.id);
    if (tomb !== undefined && tomb >= stamp(c)) {
      yaBorradas++;
      continue;
    }
    const local = cardById.get(c.id);
    if (!local) nuevas++;
    else if (stamp(c) > stamp(local)) actualizadas++;
  }

  const entrantes = new Set(cards.ok.map((c) => c.id));
  const pasos = steps.filter((s) => {
    if (!cardById.has(s.cardId) && !entrantes.has(s.cardId) && tombById.has(s.cardId)) return false;
    const local = stepById.get(s.id);
    return !local || s.updatedAt > (local.updatedAt ?? 0);
  }).length;

  const aPapelera = deleted.filter((t) => {
    const local = cardById.get(t.id);
    return local !== undefined && stamp(local) <= t.deletedAt;
  }).length;

  const caminos = links.filter((l) => {
    const local = linkById.get(l.id);
    return !local || l.updatedAt > local.updatedAt;
  }).length;

  const enCola = new Set(listQueue().map((r) => shortcodeOf(r.url)));
  const reels = new Set(queue.map((r) => shortcodeOf(r.url)).filter((sc) => !enCola.has(sc))).size;

  return {
    cards: cards.ok,
    steps,
    deleted,
    links,
    queue,
    nuevas,
    actualizadas,
    yaBorradas,
    invalidas: cards.invalid,
    pasos,
    aPapelera,
    caminos,
    reels,
  };
}

/** ¿Cambiaría algo al importar? */
export function planHasChanges(p: TransferPlan): boolean {
  return p.nuevas + p.actualizadas + p.pasos + p.aPapelera + p.caminos + p.reels > 0;
}

const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;

/** Previsualización en frases cortas, para el diálogo de confirmación. */
export function describePlan(p: TransferPlan): string[] {
  const out: string[] = [];
  if (p.nuevas) out.push(n(p.nuevas, 'ficha nueva', 'fichas nuevas'));
  if (p.actualizadas) out.push(n(p.actualizadas, 'ficha actualizada', 'fichas actualizadas'));
  if (p.pasos) out.push(n(p.pasos, 'micropaso con avances', 'micropasos con avances'));
  if (p.caminos) out.push(n(p.caminos, 'camino entre fichas', 'caminos entre fichas'));
  if (p.aPapelera) out.push(n(p.aPapelera, 'ficha borrada allí (irá a la papelera)', 'fichas borradas allí (irán a la papelera)'));
  if (p.reels) out.push(n(p.reels, 'reel pendiente', 'reels pendientes'));
  return out;
}

/** Lo que se deja fuera a propósito, para que no parezca que se ha perdido. */
export function describeSkipped(p: TransferPlan): string[] {
  const out: string[] = [];
  if (p.yaBorradas) out.push(n(p.yaBorradas, 'ficha que borraste aquí no vuelve', 'fichas que borraste aquí no vuelven'));
  if (p.invalidas) out.push(n(p.invalidas, 'ficha incompleta se descarta', 'fichas incompletas se descartan'));
  return out;
}

export async function applyTransfer(p: TransferPlan): Promise<{ limpiados: number }> {
  await importCards(p.cards);
  await applyTombstones(p.deleted);
  await importSteps(p.steps);
  await importLinks(p.links);
  if (p.queue.length) mergeQueue(p.queue);
  // Los reels que ya son ficha salen solos de la cola: si el PC lo procesó y
  // la ficha acaba de llegar, no pinta nada esperando aquí.
  const limpiados = p.cards.length ? pruneQueueByCards(p.cards) : 0;
  return { limpiados };
}
