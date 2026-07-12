import type { KnowledgeCard } from '../domain/types';
import { listQueue, type PendingReel } from './queue';

/**
 * Sincronización entre dispositivos sin servidor (patrón Boardroom):
 * la biblioteca Y la cola de reels pendientes viajan comprimidas (gzip) y en
 * base64url dentro del fragmento `#sync=` de un enlace. Se abre el enlace en el
 * otro dispositivo y se importan ahí. El fragmento (#…) nunca llega a ningún
 * servidor, ni siquiera al de Vercel. La API key NO viaja en el enlace.
 */

const PREFIX = '#sync=';

export interface SyncPayload {
  cards: KnowledgeCard[];
  queue: PendingReel[];
}

export async function buildSyncLink(cards: KnowledgeCard[]): Promise<string> {
  const json = JSON.stringify({ app: 'bibliotheke', version: 1, cards, queue: listQueue() });
  const gz = await pipe(new TextEncoder().encode(json), new CompressionStream('gzip'));
  return `${location.origin}${location.pathname}${PREFIX}${toBase64Url(gz)}`;
}

/** Payload pendiente en la URL actual, o null si no venimos de un enlace de sync. */
export function pendingSyncPayload(): string | null {
  return location.hash.startsWith(PREFIX) ? location.hash.slice(PREFIX.length) : null;
}

export async function decodeSyncPayload(payload: string): Promise<SyncPayload> {
  const bytes = await pipe(fromBase64Url(payload), new DecompressionStream('gzip'));
  const data = JSON.parse(new TextDecoder().decode(bytes)) as { cards?: unknown; queue?: unknown };
  if (!Array.isArray(data.cards)) throw new Error('El enlace no contiene una biblioteca válida.');
  return {
    cards: data.cards as KnowledgeCard[],
    queue: Array.isArray(data.queue) ? (data.queue as PendingReel[]) : [],
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
