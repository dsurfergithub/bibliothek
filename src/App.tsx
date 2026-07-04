import { useCallback, useEffect, useState } from 'react';
import type { KnowledgeCard } from './domain/types';
import { getApiKey } from './services/apiKey';
import { listCards } from './services/db';
import { Onboarding } from './ui/Onboarding';
import { Library } from './ui/Library';
import { ImportView } from './ui/ImportView';
import { CardDetail } from './ui/CardDetail';
import { Settings } from './ui/Settings';

type View =
  | { name: 'library' }
  | { name: 'import' }
  | { name: 'card'; id: string }
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
        {view.name === 'settings' && <Settings onLibraryChanged={refresh} />}
      </main>

      <nav className="tabbar">
        <button className={view.name === 'library' || view.name === 'card' ? 'active' : ''} onClick={() => setView({ name: 'library' })}>
          <span className="icon">📚</span>Biblioteca
        </button>
        <button className={view.name === 'import' ? 'active' : ''} onClick={() => setView({ name: 'import' })}>
          <span className="icon">✨</span>Añadir
        </button>
        <button className={view.name === 'settings' ? 'active' : ''} onClick={() => setView({ name: 'settings' })}>
          <span className="icon">⚙️</span>Ajustes
        </button>
      </nav>
    </>
  );
}
