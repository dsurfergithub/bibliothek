/**
 * Cola de reels pendientes. En el móvil no se puede descargar de Instagram, así
 * que solo se GUARDA la URL (compartida desde Instagram o pegada a mano). La cola
 * viaja al PC dentro del enlace de sincronización y allí, con el compañero
 * abierto, se procesa por lotes. Captura barata en el móvil, procesado en el PC.
 */

const KEY = 'bibliotheke.queue';

/** reel/reels/p/tv de instagram.com, dentro de un texto cualquiera. */
const IG = /https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/;

export interface PendingReel {
  url: string;
  addedAt: number;
}

/** Extrae y normaliza la primera URL de reel de un texto (lo que comparte Instagram). */
export function extractInstagramUrl(text: string): string | null {
  const m = IG.exec(text ?? '');
  return m ? `https://www.instagram.com/reel/${m[1]}/` : null;
}

/** Shortcode del reel (identidad estable para deduplicar), o null. */
export function shortcodeOf(url: string): string | null {
  const m = IG.exec(url ?? '');
  return m ? m[1] : null;
}

export function listQueue(): PendingReel[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as PendingReel[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(queue: PendingReel[]): void {
  localStorage.setItem(KEY, JSON.stringify(queue));
}

/** Añade un reel a la cola. Devuelve false si el texto no tiene URL válida o ya estaba. */
export function enqueue(rawTextOrUrl: string): boolean {
  const url = extractInstagramUrl(rawTextOrUrl);
  if (!url) return false;
  const queue = listQueue();
  const sc = shortcodeOf(url);
  if (queue.some((r) => shortcodeOf(r.url) === sc)) return false;
  queue.push({ url, addedAt: Date.now() });
  save(queue);
  return true;
}

export function dequeue(url: string): void {
  const sc = shortcodeOf(url);
  save(listQueue().filter((r) => shortcodeOf(r.url) !== sc));
}

export function clearQueue(): void {
  localStorage.removeItem(KEY);
}

/** Funde una cola entrante (de otro dispositivo) con la local. Devuelve cuántos se añadieron. */
export function mergeQueue(incoming: PendingReel[]): number {
  const queue = listQueue();
  const have = new Set(queue.map((r) => shortcodeOf(r.url)));
  let added = 0;
  for (const reel of incoming) {
    const sc = shortcodeOf(reel?.url ?? '');
    if (sc && !have.has(sc)) {
      queue.push({ url: `https://www.instagram.com/reel/${sc}/`, addedAt: reel.addedAt ?? Date.now() });
      have.add(sc);
      added++;
    }
  }
  save(queue);
  return added;
}
