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

/** Igual que `IG` pero global: para sacar TODAS las URLs de un texto pegado. */
const IG_ALL = /https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/g;

/** Prefijo del enlace que lleva SOLO la cola (ver `buildQueueLink`). */
const REELS_PREFIX = '#reels=';

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

/* ---------- pegar varios a la vez ---------- */

/** Todas las URLs de reel de un texto, normalizadas y sin repetidos. */
export function extractAllInstagramUrls(text: string): string[] {
  const urls: string[] = [];
  const vistos = new Set<string>();
  for (const m of (text ?? '').matchAll(IG_ALL)) {
    if (!vistos.has(m[1])) {
      vistos.add(m[1]);
      urls.push(`https://www.instagram.com/reel/${m[1]}/`);
    }
  }
  return urls;
}

/**
 * Encola todos los reels que haya en un texto. Sirve para pegar de golpe una
 * lista de enlaces guardada en notas, en un chat contigo mismo o donde sea.
 * Devuelve cuántos se añadieron (los repetidos no cuentan).
 */
export function enqueueMany(text: string): number {
  return mergeQueue(extractAllInstagramUrls(text).map((url) => ({ url, addedAt: Date.now() })));
}

/* ---------- enlace SOLO de la cola ---------- */

/**
 * Enlace para llevar la cola del móvil al PC. A diferencia del `#sync=` de
 * Ajustes, aquí NO viaja la biblioteca: solo los shortcodes de los reels
 * (11 caracteres cada uno), separados por puntos.
 *
 * Ese era el problema real: mover cuatro reels obligaba a meter toda la
 * biblioteca en la URL, y a partir de unas pocas fichas el enlace se pasaba
 * del límite de las apps de mensajería y había que recurrir al archivo de
 * copia de seguridad. Así, cien reels caben en poco más de mil caracteres.
 */
export function buildQueueLink(queue: PendingReel[] = listQueue()): string {
  const codigos = queue.map((r) => shortcodeOf(r.url)).filter(Boolean);
  return `${location.origin}${location.pathname}${REELS_PREFIX}${codigos.join('.')}`;
}

/** Payload de reels pendiente en la URL actual, o null si no venimos de un enlace así. */
export function pendingQueuePayload(): string | null {
  return location.hash.startsWith(REELS_PREFIX) ? location.hash.slice(REELS_PREFIX.length) : null;
}

/** Funde en la cola local los shortcodes de un enlace `#reels=`. Devuelve cuántos entraron. */
export function mergeQueueFromPayload(payload: string): number {
  const codigos = decodeURIComponent(payload)
    .split('.')
    .map((c) => c.trim())
    .filter((c) => /^[A-Za-z0-9_-]{4,24}$/.test(c));
  return mergeQueue(codigos.map((sc) => ({ url: `https://www.instagram.com/reel/${sc}/`, addedAt: Date.now() })));
}

/** Quita el #reels=… de la barra de direcciones sin recargar. */
export function clearQueueHash(): void {
  history.replaceState(null, '', location.pathname + location.search);
}
