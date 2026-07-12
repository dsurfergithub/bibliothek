import { useCallback, useEffect, useState } from 'react';
import type { KnowledgeCard } from './domain/types';
import { getApiKey } from './services/apiKey';
import { importCards, listCards } from './services/db';
import { clearSyncHash, decodeSyncPayload, pendingSyncPayload } from './services/sync';
import { Onboarding } from './ui/Onboarding';
import { Library } from './ui/Library';
import { ImportView } from './ui/ImportView';
import { CardDetail } from './ui/CardDetail';
import { Insights } from './ui/Insights';
import { Settings } from './ui/Settings';

type View =
  | { name: 'library' }
  | { name: 'import' }
  | { name: 'card'; id: string }
  | { name: 'insights' }
  | { name: 'settings' };

export default function App() {
  const [hasKey, setHasKey] = useState(() => getApiKey() !== null);
  const [view, setView] = useState<View>({ name: 'library' });
  const [cards, setCards] = useState<KnowledgeCard[]>([]);

  const refresh = useCallback(() => {
    listCards().then(setCards);
  }, []);

  useEffect(() => {
    if (hasKey) refresh();
  }, [hasKey, refresh]);

  // ¿Venimos de un enlace de sincronización de otro dispositivo?
  useEffect(() => {
    const payload = pendingSyncPayload();
    if (!payload) return;
    // Limpiar el hash YA (síncrono): evita el doble diálogo de StrictMode y
    // no deja toda la biblioteca visible en la barra de direcciones.
    clearSyncHash();
    decodeSyncPayload(payload)
      .then(async (incoming) => {
        const ok = confirm(
          `Este enlace contiene ${incoming.length} fichas de otra biblioteca. ¿Importarlas en este dispositivo? (Las fichas repetidas se actualizan, el resto se conserva.)`
        );
        if (!ok) return;
        await importCards(incoming);
        refresh();
      })
      .catch(() => {
        alert('El enlace de sincronización no es válido o está incompleto.');
      });
  }, [refresh]);

  if (!hasKey) {
    return <Onboarding onDone={() => setHasKey(true)} />;
  }

  const openCard = cards.find((c) => view.name === 'card' && c.id === view.id);

  return (
    <>
      <header className="app-header">
        <img className="logo" src="/icon.svg" alt="" />
        <div>
          <div className="brand">Bibliotheke</div>
          <div className="tagline">No guardes contenido. Guarda conocimiento.</div>
        </div>
        <div className="spacer" />
      </header>

      <main className="main">
        {view.name === 'library' && (
          <Library
            cards={cards}
            onOpen={(id) => setView({ name: 'card', id })}
            onImport={() => setView({ name: 'import' })}
          />
        )}
        {view.name === 'import' && (
          <ImportView
            onSaved={(card) => {
              refresh();
              setView({ name: 'card', id: card.id });
            }}
          />
        )}
        {view.name === 'card' && openCard && (
          <CardDetail
            card={openCard}
            onBack={() => setView({ name: 'library' })}
            onChanged={(updated) => {
              refresh();
              if (updated === null) setView({ name: 'library' });
            }}
          />
        )}
        {view.name === 'insights' && <Insights cards={cards} />}
        {view.name === 'settings' && <Settings onLibraryChanged={refresh} />}
      </main>

      <nav className="tabbar">
        <button className={view.name === 'library' || view.name === 'card' ? 'active' : ''} onClick={() => setView({ name: 'library' })}>
          <span className="icon">📚</span>Biblioteca
        </button>
        <button className={view.name === 'import' ? 'active' : ''} onClick={() => setView({ name: 'import' })}>
          <span className="icon">✨</span>Añadir
        </button>
        <button className={view.name === 'insights' ? 'active' : ''} onClick={() => setView({ name: 'insights' })}>
          <span className="icon">📊</span>Insights
        </button>
        <button className={view.name === 'settings' ? 'active' : ''} onClick={() => setView({ name: 'settings' })}>
          <span className="icon">⚙️</span>Ajustes
        </button>
      </nav>
    </>
  );
}
