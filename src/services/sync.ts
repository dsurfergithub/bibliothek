import type { KnowledgeCard, StepRecord } from '../domain/types';
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
 * Lo que ha cambiado desde `desde`. Es la base del enlace incremental: en vez de
 * meter la biblioteca entera cada vez —que es lo que acaba haciendo el enlace
 * demasiado largo— solo viaja lo que el otro dispositivo aún no tiene.
 */
export function changesSince(
  cards: KnowledgeCard[],
  steps: StepRecord[],
  desde: number
): { cards: KnowledgeCard[]; steps: StepRecord[] } {
  return {
    cards: cards.filter((c) => stamp(c) > desde),
    steps: steps.filter((s) => (s.updatedAt ?? 0) > desde),
  };
}

export interface SyncPayload {
  cards: KnowledgeCard[];
  queue: PendingReel[];
  /** Micropasos con su estado: sin ellos, el traspaso perdería lo aplicado. */
  steps: StepRecord[];
}

/**
 * Enlace con la biblioteca. Con `desde > 0` va solo lo cambiado desde esa fecha
 * (ver `changesSince`); la cola de reels viaja siempre entera porque no pesa.
 */
export async function buildSyncLink(
  cards: KnowledgeCard[],
  steps: StepRecord[] = [],
  desde = 0
): Promise<string> {
  const sel = desde > 0 ? changesSince(cards, steps, desde) : { cards, steps };
  return encodeLink(sel.cards, sel.steps, listQueue());
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
 * cola de reels viaja solo en el primero. Antes, una biblioteca grande que
 * nunca se había enviado simplemente no se podía pasar por enlace.
 */
export async function buildSyncLinks(
  cards: KnowledgeCard[],
  steps: StepRecord[] = [],
  desde = 0,
  maxLen = MAX_LINK_CHARS
): Promise<string[]> {
  const sel = desde > 0 ? changesSince(cards, steps, desde) : { cards, steps };
  const out: string[] = [];
  // Divide por la mitad hasta que cada trozo quepa. Los pasos van con su ficha;
  // los que no tienen ficha en el lote (solo cambió su estado) caen al último.
  async function emit(cs: KnowledgeCard[], sts: StepRecord[], q: PendingReel[]): Promise<void> {
    const link = await encodeLink(cs, sts, q);
    if (link.length <= maxLen || cs.length <= 1) {
      out.push(link);
      return;
    }
    const mid = Math.ceil(cs.length / 2);
    const a = cs.slice(0, mid);
    const ids = new Set(a.map((c) => c.id));
    await emit(a, sts.filter((s) => ids.has(s.cardId)), q);
    await emit(cs.slice(mid), sts.filter((s) => !ids.has(s.cardId)), []);
  }
  await emit(sel.cards, sel.steps, listQueue());
  return out;
}

async function encodeLink(cards: KnowledgeCard[], steps: StepRecord[], queue: PendingReel[]): Promise<string> {
  const json = JSON.stringify({ app: 'bibliotheke', version: 2, cards, steps, queue });
  const gz = await pipe(new TextEncoder().encode(json), new CompressionStream('gzip'));
  return `${location.origin}${location.pathname}${PREFIX}${toBase64Url(gz)}`;
}

/** Payload pendiente en la URL actual, o null si no venimos de un enlace de sync. */
export function pendingSyncPayload(): string | null {
  return location.hash.startsWith(PREFIX) ? location.hash.slice(PREFIX.length) : null;
}

export async function decodeSyncPayload(payload: string): Promise<SyncPayload> {
  const bytes = await pipe(fromBase64Url(payload), new DecompressionStream('gzip'));
  const data = JSON.parse(new TextDecoder().decode(bytes)) as { cards?: unknown; queue?: unknown; steps?: unknown };
  if (!Array.isArray(data.cards)) throw new Error('El enlace no contiene una biblioteca válida.');
  return {
    cards: data.cards as KnowledgeCard[],
    queue: Array.isArray(data.queue) ? (data.queue as PendingReel[]) : [],
    // Los enlaces de la versión 1 no traían pasos: se recrean solos al importar.
    steps: Array.isArray(data.steps) ? (data.steps as StepRecord[]) : [],
  };
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
