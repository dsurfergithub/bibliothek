import { openDB, type IDBPDatabase } from 'idb';
import type { KnowledgeCard } from '../domain/types';

/** Repositorio local de fichas sobre IndexedDB. 100% en el dispositivo. */

const DB_NAME = 'bibliotheke';
const STORE = 'cards';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore(STORE, { keyPath: 'id' });
    },
  });
  return dbPromise;
}

export async function saveCard(card: KnowledgeCard): Promise<void> {
  await (await db()).put(STORE, card);
}

export async function getCard(id: string): Promise<KnowledgeCard | undefined> {
  return (await db()).get(STORE, id);
}

export async function listCards(): Promise<KnowledgeCard[]> {
  const all: KnowledgeCard[] = await (await db()).getAll(STORE);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteCard(id: string): Promise<void> {
  await (await db()).delete(STORE, id);
}

export async function clearAll(): Promise<void> {
  await (await db()).clear(STORE);
}

export async function importCards(cards: KnowledgeCard[]): Promise<number> {
  const database = await db();
  const tx = database.transaction(STORE, 'readwrite');
  for (const card of cards) {
    if (card && typeof card.id === 'string' && typeof card.titulo === 'string') {
      tx.store.put(card);
    }
  }
  await tx.done;
  return cards.length;
}
