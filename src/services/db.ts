import { openDB, type IDBPDatabase } from 'idb';
import type { KnowledgeCard } from '../domain/types';

/** Repositorio local de fichas sobre IndexedDB. 100% en el dispositivo. */

const DB_NAME = 'bibliotheke';
const STORE = 'cards';
/** Micropasos con su estado de aplicación (ver `services/steps.ts`). */
export const STEP_STORE = 'steps';

let dbPromise: Promise<IDBPDatabase> | null = null;

/** Conexión única a IndexedDB, compartida por `db.ts` y `steps.ts`. */
export function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) database.createObjectStore(STORE, { keyPath: 'id' });
      if (oldVersion < 2) {
        const steps = database.createObjectStore(STEP_STORE, { keyPath: 'id' });
        steps.createIndex('by-card', 'cardId');
      }
    },
  });
  return dbPromise;
}

/** Marca de tiempo para decidir "gana la más reciente" al fundir importaciones. */
const stamp = (c: KnowledgeCard) => c.updatedAt ?? c.createdAt ?? 0;

export async function saveCard(card: KnowledgeCard): Promise<void> {
  await (await db()).put(STORE, { ...card, updatedAt: Date.now() });
}

export async function getCard(id: string): Promise<KnowledgeCard | undefined> {
  return (await db()).get(STORE, id);
}

export async function listCards(): Promise<KnowledgeCard[]> {
  const all: KnowledgeCard[] = await (await db()).getAll(STORE);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/** Borra la ficha y, con ella, sus micropasos: no dejamos pasos huérfanos. */
export async function deleteCard(id: string): Promise<void> {
  const database = await db();
  await database.delete(STORE, id);
  const tx = database.transaction(STEP_STORE, 'readwrite');
  for (const key of await tx.store.index('by-card').getAllKeys(id)) tx.store.delete(key);
  await tx.done;
}

export async function clearAll(): Promise<void> {
  const database = await db();
  await database.clear(STORE);
  await database.clear(STEP_STORE);
}

/**
 * Funde una lista de fichas (de una copia de seguridad o de otro dispositivo)
 * con la biblioteca local: añade las nuevas y, si una ficha ya existe, se queda
 * con la versión más reciente (por `updatedAt`). Nunca borra. Devuelve cuántas
 * se han añadido o actualizado.
 */
export async function importCards(cards: KnowledgeCard[]): Promise<number> {
  const database = await db();
  const tx = database.transaction(STORE, 'readwrite');
  let n = 0;
  for (const card of cards) {
    if (card && typeof card.id === 'string' && typeof card.titulo === 'string') {
      const existing = (await tx.store.get(card.id)) as KnowledgeCard | undefined;
      if (!existing || stamp(card) >= stamp(existing)) {
        tx.store.put(card);
        n++;
      }
    }
  }
  await tx.done;
  return n;
}
