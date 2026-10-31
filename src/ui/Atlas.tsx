import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { KnowledgeCard, LinkRecord, StepRecord } from '../domain/types';
import { linkId } from '../domain/types';
import { fold } from '../domain/text';
import { saveLink } from '../services/db';
import {
  atlasInsights,
  KIND_LABEL,
  layoutGraph,
  layoutLocal,
  otherEnd,
  type AtlasInsight,
  type Connection,
  type Graph,
  type Layout,
} from '../services/graph';
import { progressOf } from '../services/steps';
import { Topics } from './Topics';
import { IconAdd, IconChevron, IconClose, IconCompass, IconMinus } from './icons';

export type AtlasTab = 'mapa' | 'caminos' | 'temas';

/**
 * Tamaño del lienzo del mapa (unidades del viewBox; el SVG escala al ancho
 * disponible). En el móvil el lienzo es vertical, como la pantalla.
 */
const W = 1000;
const altoLienzo = (ancho: number) => (ancho < 600 ? 1250 : 760);

/**
 * El Atlas: las fichas como lugares, los temas como regiones y lo que
 * comparten como caminos. Tres vistas:
 *
 * - **Mapa**: todo el grafo, o solo el entorno de la ficha elegida (lo más
 *   legible en el móvil). Debajo, la ficha seleccionada con sus caminos.
 * - **Caminos**: lo mismo en lista, con lo pendiente de revisar arriba y lo
 *   que se puede hacer con esas conexiones.
 * - **Temas**: el mazo por temas de siempre.
 */
export function Atlas({
  cards,
  steps,
  links,
  graph,
  tab,
  sel,
  onState,
  onOpenCard,
  onOpenTopic,
  onLinksChanged,
}: {
  cards: KnowledgeCard[];
  steps: StepRecord[];
  links: LinkRecord[];
  graph: Graph;
  tab: AtlasTab;
  sel: string | null;
  onState: (s: { tab: AtlasTab; sel: string | null }) => void;
  onOpenCard: (id: string) => void;
  onOpenTopic: (topicId: string) => void;
  onLinksChanged: () => void;
}) {
  const [entorno, setEntorno] = useState(false);
  const [trazando, setTrazando] = useState(false);

  // Si no hay selección, la ficha con más caminos: el mapa nunca arranca mudo.
  const selected =
    sel && graph.byId.has(sel)
      ? sel
      : ([...graph.byCard.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? cards[0]?.id ?? null);

  const select = (id: string, toTab: AtlasTab = tab) => {
    setTrazando(false);
    onState({ tab: toTab, sel: id });
  };

  async function decide(c: Connection, estado: LinkRecord['estado']) {
    const prev = links.find((l) => l.id === c.id);
    await saveLink({ id: c.id, a: c.a, b: c.b, estado, nota: prev?.nota ?? '', updatedAt: Date.now() });
    onLinksChanged();
  }

  /** Un camino tuyo o automático se descarta: así no vuelve a aparecer solo. */
  async function quitar(c: Connection) {
    await decide(c, 'descartada');
  }

  if (cards.length === 0) {
    return (
      <div className="empty-state">
        <h2>El Atlas está en blanco</h2>
        <p>Cuando guardes fichas, aquí verás qué conecta con qué: herramientas, métodos y conceptos que comparten.</p>
      </div>
    );
  }

  const sugeridas = graph.connections.filter((c) => c.kind === 'sugerida');

  return (
    <div className="atlas">
      <div className="atlas-head">
        <div>
          <h1 className="view-title">Atlas</h1>
          <p className="hint atlas-sub">
            {cards.length} fichas · {graph.connections.length - sugeridas.length} caminos
            {sugeridas.length > 0 && ` · ${sugeridas.length} por revisar`}
          </p>
        </div>
      </div>

      <div className="segmented" role="tablist" aria-label="Vista del Atlas">
        {(
          [
            ['mapa', 'Mapa'],
            ['caminos', 'Caminos'],
            ['temas', 'Temas'],
          ] as [AtlasTab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'on' : ''}
            onClick={() => onState({ tab: t, sel: selected })}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'temas' && <Topics cards={cards} onOpen={onOpenTopic} embedded />}

      {tab === 'mapa' && (
        <>
          {graph.connections.length === 0 ? (
            <div className="empty-state compact">
              <p>
                Tus fichas aún no comparten herramientas, métodos ni conceptos. Puedes trazar un camino a mano desde
                cualquier ficha.
              </p>
            </div>
          ) : (
            <AtlasMap graph={graph} sel={selected} entorno={entorno} onSelect={(id) => select(id)} onEntorno={setEntorno} />
          )}
          {selected && (
            <SelectedPanel
              card={graph.byId.get(selected)!}
              graph={graph}
              steps={steps}
              trazando={trazando}
              onTrazar={setTrazando}
              onSelect={select}
              onOpenCard={onOpenCard}
              onDecide={decide}
              onQuitar={quitar}
              onLinked={onLinksChanged}
              cards={cards}
            />
          )}
          {graph.lonely.length > 0 && (
            <section className="section atlas-island">
              <h2>Sin caminos todavía</h2>
              <p className="hint">
                {graph.lonely.length === 1 ? 'Esta ficha no conecta' : `Estas ${graph.lonely.length} fichas no conectan`} con
                ninguna otra. Elige una para trazarle un camino.
              </p>
              <div className="chip-row">
                {graph.lonely.slice(0, 12).map((c) => (
                  <button key={c.id} className="chip-filter" onClick={() => select(c.id)}>
                    {c.titulo}
                  </button>
                ))}
                {graph.lonely.length > 12 && <span className="hint">…y {graph.lonely.length - 12} más.</span>}
              </div>
            </section>
          )}
        </>
      )}

      {tab === 'caminos' && (
        <CaminosList
          graph={graph}
          cards={cards}
          steps={steps}
          onSelect={(id) => select(id, 'mapa')}
          onOpenCard={onOpenCard}
          onDecide={decide}
        />
      )}
    </div>
  );
}

/* ============================ mapa ============================ */

function AtlasMap({
  graph,
  sel,
  entorno,
  onSelect,
  onEntorno,
}: {
  graph: Graph;
  sel: string | null;
  entorno: boolean;
  onSelect: (id: string) => void;
  onEntorno: (v: boolean) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  /** Ancho real del mapa en pantalla: los textos y puntos se dimensionan en píxeles, no en unidades del lienzo. */
  const [ancho, setAncho] = useState(() => Math.min(window.innerWidth - 40, 1000));
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => el.clientWidth && setAncho(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = altoLienzo(ancho);
  const global = useMemo(() => layoutGraph(graph, W, H), [graph, H]);
  const local = useMemo(() => (sel && entorno ? layoutLocal(graph, sel, W, H) : null), [graph, sel, entorno, H]);
  const layout: Layout = local ?? global;
  const [view, setView] = useState({ x: 0, y: 0, w: W, h: H });
  useEffect(() => setView({ x: 0, y: 0, w: W, h: H }), [H]);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const zoom = local ? 1 : W / view.w;
  /** De píxeles de pantalla a unidades del lienzo, con el zoom actual. */
  const u = (px: number) => (px * (local ? W : view.w)) / ancho;

  const vecinos = new Set<string>(sel ? [sel] : []);
  for (const c of (sel && graph.byCard.get(sel)) || []) vecinos.add(otherEnd(c, sel!));

  const visibles = local ? graph.connections.filter((c) => local.pos.has(c.a) && local.pos.has(c.b) && (c.a === sel || c.b === sel)) : graph.connections;
  const nodos = [...layout.pos.keys()];
  // Con muchas fichas, solo se rotulan la elegida y sus vecinas (o todas al acercarte).
  const rotularTodo = local !== null || nodos.length <= (ancho < 600 ? 8 : 24) || zoom >= 1.8;

  function zoomBy(f: number, cx = view.x + view.w / 2, cy = view.y + view.h / 2) {
    setView((v) => {
      const w = Math.min(W, Math.max(W / 5, v.w / f));
      const h = (w * H) / W;
      return { w, h, x: clampX(cx - ((cx - v.x) * w) / v.w, w), y: clampY(cy - ((cy - v.y) * h) / v.h, h) };
    });
  }
  const clampX = (x: number, w: number) => Math.min(Math.max(x, -W * 0.1), W * 1.1 - w);
  const clampY = (y: number, h: number) => Math.min(Math.max(y, -H * 0.1), H * 1.1 - h);

  /** Pasa de píxeles de pantalla a unidades del lienzo. */
  function toCanvas(px: number, py: number) {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: view.x + ((px - r.left) / r.width) * view.w, y: view.y + ((py - r.top) / r.height) * view.h };
  }

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if ((e.target as Element).closest('.atlas-node')) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || local) return;
    const r = svgRef.current!.getBoundingClientRect();
    if (pointers.current.size === 1) {
      const dx = ((e.clientX - prev.x) / r.width) * view.w;
      const dy = ((e.clientY - prev.y) / r.height) * view.h;
      setView((v) => ({ ...v, x: clampX(v.x - dx, v.w), y: clampY(v.y - dy, v.h) }));
    } else if (pointers.current.size === 2) {
      // Pellizco: el cociente de distancias entre los dos dedos es el zoom.
      const [a, b] = [...pointers.current.entries()].map(([id, p]) => (id === e.pointerId ? { x: e.clientX, y: e.clientY } : p));
      const [pa, pb] = [...pointers.current.values()];
      const antes = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      const ahora = Math.hypot(a.x - b.x, a.y - b.y);
      if (antes > 0) {
        const c = toCanvas((a.x + b.x) / 2, (a.y + b.y) / 2);
        zoomBy(ahora / antes, c.x, c.y);
      }
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  function onPointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
  }

  const vb = local ? `0 0 ${W} ${H}` : `${view.x} ${view.y} ${view.w} ${view.h}`;
  const selCard = sel ? graph.byId.get(sel) : null;

  return (
    <figure className="atlas-map">
      <div className="atlas-toolbar">
        <button
          className={`chip-filter ${entorno ? 'on' : ''}`}
          aria-pressed={entorno}
          onClick={() => onEntorno(!entorno)}
          disabled={!sel || !graph.byCard.has(sel)}
        >
          Solo su entorno
        </button>
        <span className="atlas-legend" aria-hidden="true">
          <span className="leg solid" /> confirmado
          <span className="leg dashed" /> por revisar
        </span>
        {!local && (
          <span className="atlas-zoom">
            <button className="btn ghost square" aria-label="Alejar" onClick={() => zoomBy(1 / 1.4)} disabled={zoom <= 1}>
              <IconMinus size={18} />
            </button>
            <button className="btn ghost square" aria-label="Acercar" onClick={() => zoomBy(1.4)} disabled={zoom >= 5}>
              <IconAdd size={18} />
            </button>
          </span>
        )}
      </div>
      <svg
        ref={svgRef}
        className="atlas-svg"
        viewBox={vb}
        style={{ aspectRatio: `${W} / ${H}` }}
        role="group"
        aria-label={`Mapa de conexiones${selCard ? `. Seleccionada: ${selCard.titulo}` : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => {
          if (local || !e.ctrlKey) return;
          const c = toCanvas(e.clientX, e.clientY);
          zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, c.x, c.y);
        }}
      >
        <g className="atlas-regions" aria-hidden="true">
          {layout.regions.map((r) => (
            <g key={r.nombre}>
              <circle cx={r.x} cy={r.y} r={r.r} />
              <text x={r.x} y={r.y - r.r - u(6)} textAnchor="middle" style={{ fontSize: u(11) }}>
                {r.nombre.toUpperCase()}
              </text>
            </g>
          ))}
        </g>
        <g className="atlas-edges" aria-hidden="true">
          {visibles.map((c) => {
            const a = layout.pos.get(c.a);
            const b = layout.pos.get(c.b);
            if (!a || !b) return null;
            const on = c.a === sel || c.b === sel;
            return (
              <line
                key={c.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={`${on ? 'on' : ''} ${c.kind === 'sugerida' ? 'sug' : ''}`}
                style={{ strokeWidth: u(on ? 2.2 : 1.2) }}
              />
            );
          })}
        </g>
        <g className="atlas-nodes">
          {nodos.map((id) => {
            const p = layout.pos.get(id)!;
            const card = graph.byId.get(id)!;
            const isSel = id === sel;
            const near = vecinos.has(id);
            const grado = graph.byCard.get(id)?.length ?? 0;
            const r = u(isSel ? 8 : 3.5 + Math.min(grado, 6) * 0.5);
            const label = rotularTodo || near;
            return (
              <g
                key={id}
                className={`atlas-node ${isSel ? 'sel' : ''} ${sel && !near ? 'dim' : ''}`}
                transform={`translate(${p.x} ${p.y})`}
                role="button"
                tabIndex={0}
                aria-pressed={isSel}
                aria-label={`${card.titulo}, ${grado} camino${grado === 1 ? '' : 's'}`}
                onClick={() => onSelect(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(id);
                  }
                }}
              >
                <circle className="hit" r={u(22)} />
                {isSel && <circle className="halo" r={r + u(4)} />}
                <circle className="dot" r={r} />
                {label && (
                  // La elegida se rotula encima: debajo suele chocar con la de una vecina.
                  <text
                    y={isSel ? -(r + u(9)) : r + u(13)}
                    textAnchor="middle"
                    style={{ fontSize: u(12), strokeWidth: u(3.5) }}
                  >
                    {corto(card.titulo, ancho < 600 ? 24 : 30)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {!local && <figcaption className="hint">Arrastra para moverte y pellizca (o usa + y −) para acercarte.</figcaption>}
    </figure>
  );
}

function corto(t: string, max: number): string {
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/* ============================ ficha seleccionada ============================ */

function SelectedPanel({
  card,
  cards,
  graph,
  steps,
  trazando,
  onTrazar,
  onSelect,
  onOpenCard,
  onDecide,
  onQuitar,
  onLinked,
}: {
  card: KnowledgeCard;
  cards: KnowledgeCard[];
  graph: Graph;
  steps: StepRecord[];
  trazando: boolean;
  onTrazar: (v: boolean) => void;
  onSelect: (id: string) => void;
  onOpenCard: (id: string) => void;
  onDecide: (c: Connection, estado: LinkRecord['estado']) => void;
  onQuitar: (c: Connection) => void;
  onLinked: () => void;
}) {
  const conns = graph.byCard.get(card.id) ?? [];
  const { hechos, total } = progressOf(steps, card.id);
  const progreso =
    total === 0
      ? 'Ficha de consulta: sin micropasos'
      : hechos === total
        ? `Aplicada: ${total} de ${total} pasos`
        : `${hechos} de ${total} pasos dados`;

  return (
    <section className="atlas-panel card" aria-label="Ficha seleccionada">
      <p className="atlas-meta">
        {card.categoria || 'Sin tema'} · {card.nivel}
      </p>
      <h2 className="atlas-title">{card.titulo}</h2>
      {card.ideaPrincipal && <p className="atlas-idea">«{card.ideaPrincipal}»</p>}
      {total > 0 && (
        <div className="atlas-progress">
          <span className="pips" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={i < hechos ? 'done' : ''} />
            ))}
          </span>
          <span className="hint">{progreso}</span>
        </div>
      )}
      {total === 0 && <p className="hint">{progreso}</p>}

      <h3 className="atlas-h3">Caminos desde aquí</h3>
      {conns.length === 0 && <p className="hint">Aún no conecta con ninguna ficha. Traza un camino si sabes con cuál.</p>}
      <ul className="conn-list">
        {conns.map((c) => (
          <ConnRow key={c.id} c={c} from={card.id} graph={graph} onSelect={onSelect} onDecide={onDecide} onQuitar={onQuitar} />
        ))}
      </ul>

      {trazando ? (
        <TrazarCamino from={card} cards={cards} graph={graph} onCancel={() => onTrazar(false)} onDone={() => { onTrazar(false); onLinked(); }} />
      ) : (
        <div className="settings-row atlas-actions">
          <button className="btn primary" onClick={() => onOpenCard(card.id)}>
            Abrir ficha
          </button>
          <button className="btn" onClick={() => onTrazar(true)}>
            <IconCompass size={16} /> Trazar camino
          </button>
        </div>
      )}
    </section>
  );
}

function ConnRow({
  c,
  from,
  graph,
  onSelect,
  onDecide,
  onQuitar,
}: {
  c: Connection;
  from: string;
  graph: Graph;
  onSelect: (id: string) => void;
  onDecide: (c: Connection, estado: LinkRecord['estado']) => void;
  onQuitar: (c: Connection) => void;
}) {
  const other = graph.byId.get(otherEnd(c, from));
  if (!other) return null;
  const sug = c.kind === 'sugerida';
  return (
    <li className={`conn ${sug ? 'sug' : ''}`}>
      <button className="conn-main" onClick={() => onSelect(other.id)}>
        <span className="conn-title">{other.titulo}</span>
        <span className={`conn-kind ${sug ? 'sug' : ''}`}>{KIND_LABEL[c.kind]}</span>
      </button>
      <p className="conn-why">{c.reason}</p>
      {sug ? (
        <div className="conn-actions">
          <button className="btn small" onClick={() => onDecide(c, 'confirmada')}>
            Confirmar
          </button>
          <button className="btn small ghost" onClick={() => onDecide(c, 'descartada')}>
            Descartar
          </button>
        </div>
      ) : (
        <button className="btn small ghost conn-remove" onClick={() => onQuitar(c)} aria-label={`Quitar el camino con ${other.titulo}`}>
          <IconClose size={14} /> {c.kind === 'manual' ? 'Quitar' : 'No están relacionadas'}
        </button>
      )}
    </li>
  );
}

/** Enlazar dos fichas a mano, con una frase que explique por qué. */
function TrazarCamino({
  from,
  cards,
  graph,
  onCancel,
  onDone,
}: {
  from: KnowledgeCard;
  cards: KnowledgeCard[];
  graph: Graph;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [q, setQ] = useState('');
  const [to, setTo] = useState<KnowledgeCard | null>(null);
  const [nota, setNota] = useState('');
  const ya = new Set((graph.byCard.get(from.id) ?? []).filter((c) => c.kind !== 'sugerida').map((c) => otherEnd(c, from.id)));
  const candidatas = cards
    .filter((c) => c.id !== from.id && !ya.has(c.id) && (!q.trim() || fold(c.titulo).includes(fold(q.trim()))))
    .slice(0, 6);

  async function guardar() {
    if (!to) return;
    await saveLink({ id: linkId(from.id, to.id), a: from.id, b: to.id, estado: 'manual', nota: nota.trim(), updatedAt: Date.now() });
    onDone();
  }

  return (
    <div className="trazar">
      <h3 className="atlas-h3">Trazar un camino desde «{from.titulo}»</h3>
      {to ? (
        <p className="trazar-to">
          Hasta <strong>{to.titulo}</strong>{' '}
          <button className="btn small ghost" onClick={() => setTo(null)}>
            Cambiar
          </button>
        </p>
      ) : (
        <>
          <label className="sr-only" htmlFor="trazar-q">
            Buscar la otra ficha
          </label>
          <input
            id="trazar-q"
            className="input"
            type="search"
            placeholder="¿Con qué ficha?"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <ul className="trazar-list">
            {candidatas.map((c) => (
              <li key={c.id}>
                <button className="row-link" onClick={() => setTo(c)}>
                  <span className="row-main">
                    <span className="row-title">{c.titulo}</span>
                    <span className="row-sub">{c.categoria}</span>
                  </span>
                  <IconChevron size={16} className="row-chevron" />
                </button>
              </li>
            ))}
            {candidatas.length === 0 && <li className="hint">Ninguna ficha coincide.</li>}
          </ul>
        </>
      )}
      <div className="field" style={{ marginTop: 10 }}>
        <label htmlFor="trazar-nota">¿Por qué están relacionadas? (opcional)</label>
        <textarea
          id="trazar-nota"
          className="textarea"
          rows={2}
          placeholder="Por ejemplo: mi revisión semanal vive en Obsidian"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
      </div>
      <div className="settings-row">
        <button className="btn primary" disabled={!to} onClick={guardar}>
          Guardar camino
        </button>
        <button className="btn ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/* ============================ caminos en lista ============================ */

function CaminosList({
  graph,
  cards,
  steps,
  onSelect,
  onOpenCard,
  onDecide,
}: {
  graph: Graph;
  cards: KnowledgeCard[];
  steps: StepRecord[];
  onSelect: (id: string) => void;
  onOpenCard: (id: string) => void;
  onDecide: (c: Connection, estado: LinkRecord['estado']) => void;
}) {
  const [mas, setMas] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);
  const insights = useMemo(() => atlasInsights(graph, cards, steps), [graph, cards, steps]);
  const titulo = (id: string) => graph.byId.get(id)?.titulo ?? '';
  const sugeridas = graph.connections.filter((c) => c.kind === 'sugerida');
  const confirmadas = graph.connections.filter((c) => c.kind !== 'sugerida').sort((a, b) => b.weight - a.weight);
  const visibles = mas ? confirmadas : confirmadas.slice(0, 20);

  return (
    <div>
      {insights.length > 0 && (
        <section className="section">
          <h2>Qué puedes hacer con esto</h2>
          <ul className="insight-list">
            {insights.map((i, k) => (
              <InsightRow
                key={k}
                i={i}
                abierto={abierto === k}
                onToggle={() => setAbierto(abierto === k ? null : k)}
                titulo={titulo}
                onOpenCard={onOpenCard}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h2>Por revisar</h2>
        {sugeridas.length === 0 ? (
          <p className="hint">Nada pendiente: todos los caminos sugeridos están revisados.</p>
        ) : (
          <ul className="conn-list">
            {sugeridas.map((c) => (
              <li key={c.id} className="conn sug">
                <button className="conn-main" onClick={() => onSelect(c.a)}>
                  <span className="conn-title">
                    {titulo(c.a)} <span className="conn-sep">↔</span> {titulo(c.b)}
                  </span>
                </button>
                <p className="conn-why">{c.reason}</p>
                <div className="conn-actions">
                  <button className="btn small" onClick={() => onDecide(c, 'confirmada')}>
                    Confirmar
                  </button>
                  <button className="btn small ghost" onClick={() => onDecide(c, 'descartada')}>
                    Descartar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Caminos confirmados</h2>
        {confirmadas.length === 0 ? (
          <p className="hint">Todavía no hay caminos entre tus fichas.</p>
        ) : (
          <ul className="conn-list">
            {visibles.map((c) => (
              <li key={c.id} className="conn">
                <button className="conn-main" onClick={() => onSelect(c.a)}>
                  <span className="conn-title">
                    {titulo(c.a)} <span className="conn-sep">↔</span> {titulo(c.b)}
                  </span>
                  <span className="conn-kind">{KIND_LABEL[c.kind]}</span>
                </button>
                <p className="conn-why">{c.reason}</p>
              </li>
            ))}
          </ul>
        )}
        {confirmadas.length > 20 && !mas && (
          <button className="btn" onClick={() => setMas(true)}>
            Ver los {confirmadas.length} caminos
          </button>
        )}
      </section>

      {graph.lonely.length > 0 && (
        <section className="section">
          <h2>Sin caminos</h2>
          <p className="hint">Añádeles un camino desde el mapa o clasifícalas en un tema.</p>
          <div className="chip-row">
            {graph.lonely.slice(0, 20).map((c) => (
              <button key={c.id} className="chip-filter" onClick={() => onSelect(c.id)}>
                {c.titulo}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function InsightRow({
  i,
  abierto,
  onToggle,
  titulo,
  onOpenCard,
}: {
  i: AtlasInsight;
  abierto: boolean;
  onToggle: () => void;
  titulo: (id: string) => string;
  onOpenCard: (id: string) => void;
}) {
  const grupo = i.tipo === 'metodo' || i.tipo === 'reciente' ? i.cardIds : i.tipo === 'parecidas' ? [i.a, i.b] : null;
  return (
    <li className="insight">
      <p className="insight-title">{i.titulo}</p>
      <p className="hint">{i.detalle}</p>
      {i.tipo === 'aplicar' ? (
        <button className="btn small" onClick={() => onOpenCard(i.cardId)}>
          Elegir su primer paso
        </button>
      ) : (
        <button className="btn small" aria-expanded={abierto} onClick={onToggle}>
          {i.tipo === 'parecidas' ? 'Compararlas' : 'Verlas juntas'}
        </button>
      )}
      {abierto && grupo && (
        <ul className="insight-cards">
          {grupo.map((id) => (
            <li key={id}>
              <button className="row-link" onClick={() => onOpenCard(id)}>
                <span className="row-main">
                  <span className="row-title">{titulo(id)}</span>
                </span>
                <IconChevron size={16} className="row-chevron" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
