import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { KnowledgeCard, LinkRecord, StepRecord } from './domain/types';
import { getApiKey, sinClave } from './services/apiKey';
import { listCards, listLinks } from './services/db';
import { doneToday, ensureSteps, listSteps } from './services/steps';
import { applyTransfer, describePlan, describeSkipped, planHasChanges, planTransfer } from './services/transfer';
import { clearSyncHash, decodeSyncPayload, pendingSyncPayload } from './services/sync';
import { clearQueueHash, enqueue, mergeQueueFromPayload, pendingQueuePayload } from './services/queue';
import { Onboarding } from './ui/Onboarding';
import { Library, NO_FILTERS, type LibraryFilters } from './ui/Library';
import { Practice } from './ui/Practice';
import { ImportView } from './ui/ImportView';
import { CardDetail } from './ui/CardDetail';
import { Insights } from './ui/Insights';
import { Settings } from './ui/Settings';
import { Atlas, type AtlasTab } from './ui/Atlas';
import { buildGraph } from './services/graph';
import { Deck } from './ui/Deck';
import { IconAdd, IconChart, IconCompass, IconDice, IconLibrary, IconSettings } from './ui/icons';

type View =
  | { name: 'library' }
  | { name: 'practice' }
  | { name: 'import'; startTab?: 'instagram'; aviso?: string; nonce?: number }
  /** `back`: a dónde volver al cerrar la ficha (por defecto, la biblioteca). */
  | { name: 'card'; id: string; back?: View }
  | { name: 'atlas'; tab: AtlasTab; sel: string | null }
  | { name: 'deck'; topicId: string }
  | { name: 'insights' }
  | { name: 'settings' };

export default function App() {
  // Sin clave también se entra: la biblioteca, el Atlas y las copias no la necesitan; solo analizar.
  const [entrar, setEntrar] = useState(() => getApiKey() !== null || sinClave());
  const [view, setView] = useState<View>({ name: 'library' });
  const [cards, setCards] = useState<KnowledgeCard[]>([]);
  const [steps, setSteps] = useState<StepRecord[]>([]);
  const [links, setLinks] = useState<LinkRecord[]>([]);
  /** Búsqueda y filtros de la biblioteca: viven aquí para seguir puestos al volver de una ficha. */
  const [libFilters, setLibFilters] = useState<LibraryFilters>(NO_FILTERS);
  const libScroll = useRef(0);
  const graph = useMemo(() => buildGraph(cards, links), [cards, links]);

  /** Recarga fichas y, de paso, crea los micropasos que falten (fichas antiguas incluidas). */
  const refresh = useCallback(async () => {
    const list = await listCards();
    setCards(list);
    setSteps(await ensureSteps(list));
    setLinks(await listLinks());
  }, []);

  const refreshLinks = useCallback(() => {
    listLinks().then(setLinks);
  }, []);

  /** Abre una ficha recordando dónde estabas en la biblioteca. */
  const openFromLibrary = (id: string) => {
    libScroll.current = window.scrollY;
    setView({ name: 'card', id });
  };

  // Al volver a la biblioteca, a la misma altura de la lista.
  useLayoutEffect(() => {
    if (view.name === 'library') window.scrollTo(0, libScroll.current);
    else if (view.name !== 'card') libScroll.current = 0;
  }, [view.name]);

  /** Solo el estado de los pasos: marcar uno no tiene por qué recargar la biblioteca. */
  const refreshSteps = useCallback(() => {
    listSteps().then(setSteps);
  }, []);

  useEffect(() => {
    if (entrar) void refresh();
  }, [entrar, refresh]);

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
        .then(planTransfer)
        .then(async (plan) => {
          const cambios = describePlan(plan);
          const omitidas = describeSkipped(plan);
          if (!planHasChanges(plan)) {
            alert(
              ['Este enlace no trae nada nuevo para este dispositivo: ya estaba todo al día.', ...omitidas].join('\n')
            );
            return;
          }
          const ok = confirm(
            [
              'Este enlace de otro dispositivo trae:',
              ...cambios.map((c) => `• ${c}`),
              ...(omitidas.length ? ['', ...omitidas] : []),
              '',
              '¿Importarlo aquí? Lo demás se conserva.',
            ].join('\n')
          );
          if (!ok) return;
          const { limpiados } = await applyTransfer(plan);
          void refresh();
          if (plan.reels > 0 || limpiados > 0) {
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

  if (!entrar) {
    return <Onboarding onDone={() => setEntrar(true)} />;
  }

  const openCard = cards.find((c) => view.name === 'card' && c.id === view.id);
  const enAtlas =
    view.name === 'atlas' ||
    view.name === 'deck' ||
    (view.name === 'card' && (view.back?.name === 'deck' || view.back?.name === 'atlas'));
  const atlasTemas: View = { name: 'atlas', tab: 'temas', sel: null };
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
        <button
          className={`header-btn ${view.name === 'settings' ? 'active' : ''}`}
          onClick={() => setView({ name: 'settings' })}
          aria-label="Ajustes"
          aria-current={view.name === 'settings' ? 'page' : undefined}
        >
          <IconSettings size={20} />
        </button>
      </header>

      <main className="main">
        {view.name === 'library' && (
          <Library
            cards={cards}
            steps={steps}
            filters={libFilters}
            onFilters={setLibFilters}
            onOpen={openFromLibrary}
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
            onGoSettings={() => setView({ name: 'settings' })}
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
            backLabel={view.back?.name === 'deck' ? 'Mazo' : view.back?.name === 'atlas' ? 'Atlas' : view.back?.name === 'card' ? 'Ficha anterior' : 'Biblioteca'}
            onBack={() => setView(view.back ?? { name: 'library' })}
            onChanged={(updated) => {
              void refresh();
              if (updated === null) setView(view.back ?? { name: 'library' });
            }}
            onStepsChanged={refreshSteps}
            graph={graph}
            onOpenCard={(id) => setView({ name: 'card', id, back: view })}
            onOpenAtlas={(id) => setView({ name: 'atlas', tab: 'mapa', sel: id })}
          />
        )}
        {view.name === 'atlas' && (
          <Atlas
            cards={cards}
            steps={steps}
            links={links}
            graph={graph}
            tab={view.tab}
            sel={view.sel}
            onState={({ tab, sel }) => setView({ name: 'atlas', tab, sel })}
            onOpenCard={(id) => setView({ name: 'card', id, back: view })}
            onOpenTopic={(topicId) => setView({ name: 'deck', topicId })}
            onLinksChanged={refreshLinks}
          />
        )}
        {view.name === 'deck' && (
          <Deck
            key={view.topicId}
            topicId={view.topicId}
            cards={cards}
            onBack={() => setView(atlasTemas)}
            onOpenCard={(id) => setView({ name: 'card', id, back: view })}
            onChanged={() => void refresh()}
          />
        )}
        {view.name === 'insights' && (
          <Insights
            cards={cards}
            steps={steps}
            onOpenCard={(id) => setView({ name: 'card', id })}
            onPractice={() => setView({ name: 'practice' })}
            onSettings={() => setView({ name: 'settings' })}
          />
        )}
        {view.name === 'settings' && <Settings onLibraryChanged={() => void refresh()} />}
      </main>

      <nav className="tabbar" aria-label="Secciones">
        <Tab label="Biblioteca" active={view.name === 'library' || (view.name === 'card' && !enAtlas)} onClick={() => setView({ name: 'library' })}>
          <IconLibrary size={21} />
        </Tab>
        <Tab label="Práctica" active={view.name === 'practice'} onClick={() => setView({ name: 'practice' })} badge={pendientesHoy}>
          <IconDice size={21} />
        </Tab>
        <Tab label="Añadir" active={view.name === 'import'} onClick={() => setView({ name: 'import' })}>
          <IconAdd size={21} />
        </Tab>
        <Tab label="Atlas" active={enAtlas} onClick={() => setView({ name: 'atlas', tab: 'mapa', sel: null })}>
          <IconCompass size={21} />
        </Tab>
        <Tab label="Insights" active={view.name === 'insights'} onClick={() => setView({ name: 'insights' })}>
          <IconChart size={21} />
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
