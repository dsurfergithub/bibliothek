import { openDB, type IDBPDatabase, type IDBPTransaction } from 'idb';
import type { KnowledgeCard, LinkRecord, StepRecord, Tombstone } from '../domain/types';
import { normalizeCard } from '../domain/normalize';

/** Repositorio local de fichas sobre IndexedDB. 100% en el dispositivo. */

const DB_NAME = 'bibliotheke';
export const CARD_STORE = 'cards';
/** Micropasos con su estado de aplicación (ver `services/steps.ts`). */
export const STEP_STORE = 'steps';
/** Papelera y registro de borrados (ver `TrashEntry`). */
export const TRASH_STORE = 'trash';
/** Caminos entre fichas que has decidido tú (ver `LinkRecord`). */
export const LINK_STORE = 'links';

/**
 * Una ficha borrada. Mientras conserva `card`, está en la papelera y se puede
 * restaurar; al vaciar la papelera se queda solo el rastro (`id` + `deletedAt`),
 * que sigue viajando entre dispositivos para que la ficha no reaparezca al
 * importar una copia antigua.
 */
export interface TrashEntry extends Tombstone {
  card?: KnowledgeCard;
  steps?: StepRecord[];
}

let dbPromise: Promise<IDBPDatabase> | null = null;

/** Conexión única a IndexedDB, compartida por `db.ts` y `steps.ts`. */
export function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 3, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) database.createObjectStore(CARD_STORE, { keyPath: 'id' });
      if (oldVersion < 2) {
        const steps = database.createObjectStore(STEP_STORE, { keyPath: 'id' });
        steps.createIndex('by-card', 'cardId');
      }
      if (oldVersion < 3) {
        database.createObjectStore(TRASH_STORE, { keyPath: 'id' });
        database.createObjectStore(LINK_STORE, { keyPath: 'id' });
      }
    },
  });
  return dbPromise;
}

/** Marca de tiempo para decidir "gana la más reciente" al fundir importaciones. */
export const stamp = (c: KnowledgeCard) => c.updatedAt ?? c.createdAt ?? 0;

export async function saveCard(card: KnowledgeCard): Promise<void> {
  await (await db()).put(CARD_STORE, { ...card, updatedAt: Date.now() });
}

/** Marca o desmarca la ficha como vista. `updatedAt` cambia, así que viaja en el enlace de sincronización. */
export async function setVisto(card: KnowledgeCard, visto: boolean): Promise<KnowledgeCard> {
  const next: KnowledgeCard = { ...card, vistoAt: visto ? Date.now() : undefined, updatedAt: Date.now() };
  if (!visto) delete next.vistoAt;
  await (await db()).put(CARD_STORE, next);
  return next;
}

export async function getCard(id: string): Promise<KnowledgeCard | undefined> {
  return normalizeCard(await (await db()).get(CARD_STORE, id)) ?? undefined;
}

/**
 * Todas las fichas, ya normalizadas: si alguna se guardó incompleta con una
 * versión anterior de la app, aquí se completa en vez de romper la pantalla.
 */
export async function listCards(): Promise<KnowledgeCard[]> {
  const all: unknown[] = await (await db()).getAll(CARD_STORE);
  return all
    .map(normalizeCard)
    .filter((c): c is KnowledgeCard => c !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Lleva la ficha a la papelera, con sus micropasos: se puede restaurar tal
 * cual. El rastro del borrado viaja en el siguiente enlace o copia.
 */
export async function deleteCard(id: string, deletedAt = Date.now()): Promise<void> {
  const database = await db();
  const tx = database.transaction([CARD_STORE, STEP_STORE, TRASH_STORE], 'readwrite');
  await moveToTrash(tx, id, deletedAt);
  await tx.done;
}

type Tx = IDBPTransaction<unknown, string[], 'readwrite'>;

async function moveToTrash(tx: Tx, id: string, deletedAt: number): Promise<boolean> {
  const cards = tx.objectStore(CARD_STORE);
  const stepStore = tx.objectStore(STEP_STORE);
  const card = normalizeCard(await cards.get(id)) ?? undefined;
  const keys = await stepStore.index('by-card').getAllKeys(id);
  const steps: StepRecord[] = [];
  for (const k of keys) {
    const s = await stepStore.get(k);
    if (s) steps.push(s);
    stepStore.delete(k);
  }
  if (card) cards.delete(id);
  const entry: TrashEntry = { id, deletedAt, ...(card ? { card, steps } : {}) };
  tx.objectStore(TRASH_STORE).put(entry);
  return Boolean(card);
}

/** Fichas en la papelera (las que aún se pueden restaurar), la más reciente primero. */
export async function listTrash(): Promise<TrashEntry[]> {
  const all: TrashEntry[] = await (await db()).getAll(TRASH_STORE);
  return all.filter((t) => t.card).sort((a, b) => b.deletedAt - a.deletedAt);
}

/** Todos los rastros de borrado, con o sin contenido en la papelera. */
export async function listTombstones(): Promise<Tombstone[]> {
  const all: TrashEntry[] = await (await db()).getAll(TRASH_STORE);
  return all.map(({ id, deletedAt }) => ({ id, deletedAt }));
}

/**
 * Saca la ficha de la papelera. Se marca como editada ahora, así que es más
 * reciente que su borrado y el otro dispositivo también la recupera.
 */
export async function restoreCard(id: string): Promise<KnowledgeCard | null> {
  const database = await db();
  const tx = database.transaction([CARD_STORE, STEP_STORE, TRASH_STORE], 'readwrite');
  const entry = (await tx.objectStore(TRASH_STORE).get(id)) as TrashEntry | undefined;
  if (!entry?.card) {
    await tx.done;
    return null;
  }
  const now = Date.now();
  const card = { ...entry.card, updatedAt: now };
  tx.objectStore(CARD_STORE).put(card);
  for (const s of entry.steps ?? []) tx.objectStore(STEP_STORE).put({ ...s, updatedAt: now });
  tx.objectStore(TRASH_STORE).delete(id);
  await tx.done;
  return card;
}

/** Vacía la papelera: se borra el contenido pero se conserva el rastro de cada borrado. */
export async function emptyTrash(): Promise<number> {
  const database = await db();
  const tx = database.transaction(TRASH_STORE, 'readwrite');
  let n = 0;
  for (const entry of (await tx.store.getAll()) as TrashEntry[]) {
    if (!entry.card) continue;
    tx.store.put({ id: entry.id, deletedAt: entry.deletedAt } satisfies TrashEntry);
    n++;
  }
  await tx.done;
  return n;
}

export async function clearAll(): Promise<void> {
  const database = await db();
  await database.clear(CARD_STORE);
  await database.clear(STEP_STORE);
  await database.clear(TRASH_STORE);
  await database.clear(LINK_STORE);
}

/**
 * Funde una lista de fichas (ya normalizadas, ver `services/transfer.ts`) con
 * la biblioteca local: añade las nuevas y, si una ficha ya existe, se queda con
 * la versión más reciente. Una ficha borrada aquí solo vuelve si es posterior
 * a su borrado. Nunca borra nada.
 */
export async function importCards(cards: KnowledgeCard[]): Promise<{ added: number; updated: number }> {
  const database = await db();
  const tx = database.transaction([CARD_STORE, TRASH_STORE], 'readwrite');
  const store = tx.objectStore(CARD_STORE);
  const trash = tx.objectStore(TRASH_STORE);
  let added = 0;
  let updated = 0;
  for (const card of cards) {
    const tomb = (await trash.get(card.id)) as TrashEntry | undefined;
    if (tomb && tomb.deletedAt >= stamp(card)) continue;
    const existing = (await store.get(card.id)) as KnowledgeCard | undefined;
    if (existing && stamp(card) <= stamp(existing)) continue;
    store.put(card);
    if (tomb) trash.delete(card.id);
    if (existing) updated++;
    else added++;
  }
  await tx.done;
  return { added, updated };
}

/**
 * Aplica los borrados de otro dispositivo: la ficha local va a la papelera si
 * no la has editado después de que allí se borrase. Devuelve cuántas movió.
 */
export async function applyTombstones(tombstones: Tombstone[]): Promise<number> {
  if (tombstones.length === 0) return 0;
  const database = await db();
  const tx = database.transaction([CARD_STORE, STEP_STORE, TRASH_STORE], 'readwrite');
  let removed = 0;
  for (const t of tombstones) {
    const card = (await tx.objectStore(CARD_STORE).get(t.id)) as KnowledgeCard | undefined;
    if (card) {
      if (stamp(card) <= t.deletedAt && (await moveToTrash(tx, t.id, t.deletedAt))) removed++;
      continue;
    }
    const entry = (await tx.objectStore(TRASH_STORE).get(t.id)) as TrashEntry | undefined;
    if (!entry || entry.deletedAt < t.deletedAt) tx.objectStore(TRASH_STORE).put({ ...entry, ...t });
  }
  await tx.done;
  return removed;
}

/* ---------- caminos entre fichas ---------- */

export async function listLinks(): Promise<LinkRecord[]> {
  return (await db()).getAll(LINK_STORE);
}

export async function saveLink(link: LinkRecord): Promise<void> {
  await (await db()).put(LINK_STORE, { ...link, updatedAt: Date.now() });
}

export async function deleteLink(id: string): Promise<void> {
  await (await db()).delete(LINK_STORE, id);
}

/** Funde caminos de otro dispositivo: gana el más reciente. */
export async function importLinks(links: LinkRecord[]): Promise<number> {
  if (links.length === 0) return 0;
  const database = await db();
  const tx = database.transaction(LINK_STORE, 'readwrite');
  let n = 0;
  for (const link of links) {
    const existing = (await tx.store.get(link.id)) as LinkRecord | undefined;
    if (existing && link.updatedAt <= existing.updatedAt) continue;
    tx.store.put(link);
    n++;
  }
  await tx.done;
  return n;
}
