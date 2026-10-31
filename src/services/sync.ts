import type { KnowledgeCard, LinkRecord, StepRecord, Tombstone } from '../domain/types';
import { listCards, listLinks, listTombstones } from './db';
import { listSteps } from './steps';
import { listQueue, type PendingReel } from './queue';

/**
 * Sincronización entre dispositivos sin servidor (patrón Boardroom):
 * la biblioteca Y la cola de reels pendientes viajan comprimidas (gzip) y en
 * base64url dentro del fragmento `#sync=` de un enlace. Se abre el enlace en el
 * otro dispositivo y se importan ahí. El fragmento (#…) nunca llega a ningún
 * servidor, ni siquiera al de Vercel. La API key NO viaja en el enlace.
 */

const PREFIX = '#sync=';
/** Momento del último envío desde ESTE dispositivo (ms). */
const LAST_OUT_KEY = 'bibliotheke.lastSyncOut';

/** Fecha de la ficha para decidir si es novedad; las viejas caen a `createdAt`. */
const stamp = (c: KnowledgeCard) => c.updatedAt ?? c.createdAt ?? 0;

/** 0 si nunca has enviado nada desde este dispositivo. */
export function lastSyncOut(): number {
  const n = Number(localStorage.getItem(LAST_OUT_KEY) ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function markSyncOut(ts = Date.now()): void {
  localStorage.setItem(LAST_OUT_KEY, String(ts));
}

/**
 * Todo lo que viaja entre dispositivos salvo la cola: fichas, micropasos,
 * borrados (para que no resuciten) y caminos entre fichas.
 */
export interface Snapshot {
  cards: KnowledgeCard[];
  steps: StepRecord[];
  deleted: Tombstone[];
  links: LinkRecord[];
}

export async function loadSnapshot(): Promise<Snapshot> {
  const [cards, steps, deleted, links] = await Promise.all([listCards(), listSteps(), listTombstones(), listLinks()]);
  return { cards, steps, deleted, links };
}

/** Elementos que lleva un snapshot (para avisos y para saber si hay algo que enviar). */
export function snapshotSize(s: Snapshot): number {
  return s.cards.length + s.steps.length + s.deleted.length + s.links.length;
}

/**
 * Lo que ha cambiado desde `desde`. Es la base del enlace incremental: en vez de
 * meter la biblioteca entera cada vez —que es lo que acaba haciendo el enlace
 * demasiado largo— solo viaja lo que el otro dispositivo aún no tiene.
 */
export function changesSince(s: Snapshot, desde: number): Snapshot {
  return {
    cards: s.cards.filter((c) => stamp(c) > desde),
    steps: s.steps.filter((p) => (p.updatedAt ?? 0) > desde),
    deleted: s.deleted.filter((t) => t.deletedAt > desde),
    links: s.links.filter((l) => l.updatedAt > desde),
  };
}

/** Lo que trae un enlace o una copia, todavía sin validar (ver `services/transfer.ts`). */
export interface RawTransfer {
  cards: unknown[];
  steps: unknown[];
  queue: PendingReel[];
  deleted: unknown[];
  links: unknown[];
}

/**
 * Enlace con la biblioteca. Con `desde > 0` va solo lo cambiado desde esa fecha
 * (ver `changesSince`); la cola de reels viaja siempre entera porque no pesa.
 */
export async function buildSyncLink(s: Snapshot, desde = 0): Promise<string> {
  return encodeLink(desde > 0 ? changesSince(s, desde) : s, listQueue());
}

/**
 * Tope por enlace. WhatsApp corta los mensajes en 65.536 caracteres y es el
 * canal habitual; por encima el enlace llega roto y el móvil no carga nada.
 */
export const MAX_LINK_CHARS = 60_000;

/**
 * Como `buildSyncLink`, pero si no cabe en un enlace parte la biblioteca en
 * varios, cada uno autocontenido (sus fichas + sus pasos) y por debajo del
 * tope. Al abrirlos en el otro dispositivo se funden: el orden da igual. La
 * cola, los borrados y los caminos (que pesan poco) viajan solo en el primero.
 * Antes, una biblioteca grande que nunca se había enviado simplemente no se
 * podía pasar por enlace.
 */
export async function buildSyncLinks(s: Snapshot, desde = 0, maxLen = MAX_LINK_CHARS): Promise<string[]> {
  const sel = desde > 0 ? changesSince(s, desde) : s;
  const out: string[] = [];
  // Divide por la mitad hasta que cada trozo quepa. Los pasos van con su ficha;
  // los que no tienen ficha en el lote (solo cambió su estado) caen al último.
  async function emit(part: Snapshot, q: PendingReel[]): Promise<void> {
    const link = await encodeLink(part, q);
    if (link.length <= maxLen || part.cards.length <= 1) {
      out.push(link);
      return;
    }
    const mid = Math.ceil(part.cards.length / 2);
    const a = part.cards.slice(0, mid);
    const ids = new Set(a.map((c) => c.id));
    await emit({ ...part, cards: a, steps: part.steps.filter((p) => ids.has(p.cardId)) }, q);
    await emit(
      { cards: part.cards.slice(mid), steps: part.steps.filter((p) => !ids.has(p.cardId)), deleted: [], links: [] },
      []
    );
  }
  await emit(sel, listQueue());
  return out;
}

async function encodeLink(s: Snapshot, queue: PendingReel[]): Promise<string> {
  const json = JSON.stringify({ app: 'bibliotheke', version: 3, ...s, queue });
  const gz = await pipe(new TextEncoder().encode(json), new CompressionStream('gzip'));
  return `${location.origin}${location.pathname}${PREFIX}${toBase64Url(gz)}`;
}

/**
 * Saca las listas de un objeto de copia o de enlace. Admite también el formato
 * más antiguo (un array de fichas a secas). Lo que falte llega vacío.
 */
export function rawTransferOf(data: unknown): RawTransfer {
  if (Array.isArray(data)) return { cards: data, steps: [], queue: [], deleted: [], links: [] };
  if (typeof data !== 'object' || data === null) throw new Error('formato');
  const d = data as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  if (!['cards', 'steps', 'queue', 'deleted', 'links'].some((k) => Array.isArray(d[k]))) throw new Error('formato');
  return {
    cards: arr(d.cards),
    // Los enlaces de la versión 1 no traían pasos: se recrean solos al importar.
    steps: arr(d.steps),
    queue: arr(d.queue) as PendingReel[],
    deleted: arr(d.deleted),
    links: arr(d.links),
  };
}

/** Payload pendiente en la URL actual, o null si no venimos de un enlace de sync. */
export function pendingSyncPayload(): string | null {
  return location.hash.startsWith(PREFIX) ? location.hash.slice(PREFIX.length) : null;
}

export async function decodeSyncPayload(payload: string): Promise<RawTransfer> {
  const bytes = await pipe(fromBase64Url(payload), new DecompressionStream('gzip'));
  return rawTransferOf(JSON.parse(new TextDecoder().decode(bytes)));
}

/** Quita el #sync=… de la barra de direcciones sin recargar. */
export function clearSyncHash(): void {
  history.replaceState(null, '', location.pathname + location.search);
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replaceAll('-', '+').replaceAll('_', '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
