import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { KnowledgeCard, StepRecord } from './domain/types';
import { getApiKey } from './services/apiKey';
import { importCards, listCards } from './services/db';
import { doneToday, ensureSteps, importSteps, listSteps } from './services/steps';
import { clearSyncHash, decodeSyncPayload, pendingSyncPayload } from './services/sync';
import {
  clearQueueHash,
  enqueue,
  mergeQueue,
  mergeQueueFromPayload,
  pendingQueuePayload,
  pruneQueueByCards,
} from './services/queue';
import { Onboarding } from './ui/Onboarding';
import { Library } from './ui/Library';
import { Practice } from './ui/Practice';
import { ImportView } from './ui/ImportView';
import { CardDetail } from './ui/CardDetail';
import { Insights } from './ui/Insights';
import { Settings } from './ui/Settings';
import { IconAdd, IconChart, IconDice, IconLibrary, IconSettings } from './ui/icons';

type View =
  | { name: 'library' }
  | { name: 'practice' }
  | { name: 'import'; startTab?: 'instagram'; aviso?: string; nonce?: number }
  | { name: 'card'; id: string }
  | { name: 'insights' }
  | { name: 'settings' };

export default function App() {
  const [hasKey, setHasKey] = useState(() => getApiKey() !== null);
  const [view, setView] = useState<View>({ name: 'library' });
  const [cards, setCards] = useState<KnowledgeCard[]>([]);
  const [steps, setSteps] = useState<StepRecord[]>([]);

  /** Recarga fichas y, de paso, crea los micropasos que falten (fichas antiguas incluidas). */
  const refresh = useCallback(async () => {
    const list = await listCards();
    setCards(list);
    setSteps(await ensureSteps(list));
  }, []);

  /** Solo el estado de los pasos: marcar uno no tiene por qué recargar la biblioteca. */
  const refreshSteps = useCallback(() => {
    listSteps().then(setSteps);
  }, []);

  useEffect(() => {
    if (hasKey) void refresh();
  }, [hasKey, refresh]);

  // ¿Venimos de un enlace de sincronización de otro dispositivo? Igual que con
  // `#reels=`, se escucha `hashchange`: pegar el enlace con la app ya abierta
  // cambia el fragmento sin recargar, y sin eso no pasaría nada.
  useEffect(() => {
    function absorberSync() {
      const payload = pendingSyncPayload();
      if (!payload) return;
      // Limpiar el hash YA (síncrono): evita el doble diálogo de StrictMode y
      // no deja toda la biblioteca visible en la barra de direcciones.
      clearSyncHash();
      decodeSyncPayload(payload)
        .then(async ({ cards, queue, steps }) => {
          const partes: string[] = [];
          if (cards.length) partes.push(`${cards.length} ficha${cards.length > 1 ? 's' : ''}`);
          if (queue.length) partes.push(`${queue.length} reel${queue.length > 1 ? 's' : ''} pendiente${queue.length > 1 ? 's' : ''}`);
          if (partes.length === 0) return;
          const ok = confirm(
            `Este enlace trae ${partes.join(' y ')} de otro dispositivo. ¿Importarlos aquí? (Las fichas repetidas se actualizan, el resto se conserva.)`
          );
          if (!ok) return;
          if (cards.length) await importCards(cards);
          if (steps.length) await importSteps(steps);
          if (queue.length) mergeQueue(queue);
          // Los reels que ya son ficha salen solos de la cola: si el PC lo
          // procesó y la ficha acaba de llegar, no pinta nada esperando aquí.
          const limpiados = cards.length ? pruneQueueByCards(cards) : 0;
          void refresh();
          if (queue.length || limpiados > 0) {
            setView({
              name: 'import',
              startTab: 'instagram',
              nonce: Date.now(),
              aviso:
                limpiados > 0
                  ? `${limpiados} reel${limpiados === 1 ? '' : 's'} de la cola ya ${limpiados === 1 ? 'era ficha' : 'eran fichas'}: ${limpiados === 1 ? 'lo he quitado' : 'los he quitado'}.`
                  : undefined,
            });
          }
        })
        .catch(() => {
          alert('El enlace de sincronización no es válido o está incompleto.');
        });
    }
    absorberSync();
    window.addEventListener('hashchange', absorberSync);
    return () => window.removeEventListener('hashchange', absorberSync);
  }, [refresh]);

  // ¿Venimos de un enlace de reels (#reels=)? Es el traspaso ligero móvil→PC:
  // solo shortcodes, sin biblioteca, así que nunca se pasa de largo.
  //
  // Se escucha también `hashchange`: si la app ya está abierta en el PC, pegar
  // el enlace en la barra de direcciones cambia el fragmento SIN recargar, y
  // sin esto no pasaría nada.
  useEffect(() => {
    function absorberReels() {
      const payload = pendingQueuePayload();
      if (!payload) return;
      clearQueueHash();
      const n = mergeQueueFromPayload(payload);
      setView({
        name: 'import',
        startTab: 'instagram',
        // Fuerza el remontaje de ImportView: sin él, ni se vería el aviso ni se
        // refrescaría la lista de la cola si la vista ya estaba abierta.
        nonce: Date.now(),
        aviso:
          n > 0
            ? `${n} reel${n === 1 ? '' : 's'} añadido${n === 1 ? '' : 's'} a la cola. Con el compañero abierto ya puedes procesarlos.`
            : 'Ese enlace no traía reels nuevos: ya estaban todos en la cola.',
      });
    }
    absorberReels();
    window.addEventListener('hashchange', absorberReels);
    return () => window.removeEventListener('hashchange', absorberReels);
  }, []);

  // ¿Nos han compartido un reel desde Instagram (share_target del PWA)?
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shared = [params.get('share_url'), params.get('share_text'), params.get('share_title')]
      .filter(Boolean)
      .join(' ');
    if (!shared) return;
    history.replaceState(null, '', location.pathname);
    const added = enqueue(shared);
    setView({ name: 'import', startTab: 'instagram' });
    if (!added) {
      setTimeout(() => alert('No se encontró un reel de Instagram en lo compartido (o ya estaba en la cola).'), 0);
    }
  }, []);

  if (!hasKey) {
    return <Onboarding onDone={() => setHasKey(true)} />;
  }

  const openCard = cards.find((c) => view.name === 'card' && c.id === view.id);
  // Punto en la pestaña Práctica: hay pasos esperando y hoy no has dado ninguno.
  const pendientesHoy = doneToday(steps) === 0 && steps.some((s) => s.estado === 'pendiente');

  return (
    <>
      <header className="app-header">
        <img className="logo" src="/icon.svg" alt="" />
        <div className="brand-block">
          <span className="brand">Bibliotheke</span>
          <span className="tagline">No guardes contenido. Guarda conocimiento.</span>
        </div>
      </header>

      <main className="main">
        {view.name === 'library' && (
          <Library
            cards={cards}
            steps={steps}
            onOpen={(id) => setView({ name: 'card', id })}
            onImport={() => setView({ name: 'import' })}
          />
        )}
        {view.name === 'practice' && (
          <Practice
            cards={cards}
            steps={steps}
            onChanged={refreshSteps}
            onOpenCard={(id) => setView({ name: 'card', id })}
          />
        )}
        {view.name === 'import' && (
          <ImportView
            key={view.nonce ?? 'import'}
            startTab={view.startTab}
            initialNotice={view.aviso}
            onSaved={(card) => {
              void refresh();
              setView({ name: 'card', id: card.id });
            }}
            onBatchDone={() => void refresh()}
          />
        )}
        {view.name === 'card' && openCard && (
          <CardDetail
            card={openCard}
            steps={steps}
            onBack={() => setView({ name: 'library' })}
            onChanged={(updated) => {
              void refresh();
              if (updated === null) setView({ name: 'library' });
            }}
            onStepsChanged={refreshSteps}
          />
        )}
        {view.name === 'insights' && (
          <Insights
            cards={cards}
            steps={steps}
            onOpenCard={(id) => setView({ name: 'card', id })}
            onPractice={() => setView({ name: 'practice' })}
          />
        )}
        {view.name === 'settings' && <Settings onLibraryChanged={() => void refresh()} />}
      </main>

      <nav className="tabbar" aria-label="Secciones">
        <Tab label="Biblioteca" active={view.name === 'library' || view.name === 'card'} onClick={() => setView({ name: 'library' })}>
          <IconLibrary size={21} />
        </Tab>
        <Tab label="Práctica" active={view.name === 'practice'} onClick={() => setView({ name: 'practice' })} badge={pendientesHoy}>
          <IconDice size={21} />
        </Tab>
        <Tab label="Añadir" active={view.name === 'import'} onClick={() => setView({ name: 'import' })}>
          <IconAdd size={21} />
        </Tab>
        <Tab label="Insights" active={view.name === 'insights'} onClick={() => setView({ name: 'insights' })}>
          <IconChart size={21} />
        </Tab>
        <Tab label="Ajustes" active={view.name === 'settings'} onClick={() => setView({ name: 'settings' })}>
          <IconSettings size={21} />
        </Tab>
      </nav>
    </>
  );
}

/** Una pestaña de la barra inferior: icono, etiqueta y punto de aviso. */
function Tab({
  label,
  active,
  onClick,
  badge,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: boolean;
  children: ReactNode;
}) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick} aria-current={active ? 'page' : undefined}>
      <span className="icon">
        {children}
        {badge && !active && <span className="dot" aria-hidden="true" />}
      </span>
      {label}
    </button>
  );
}
