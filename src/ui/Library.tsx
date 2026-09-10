import { useMemo, useState } from 'react';
import type { KnowledgeCard, StepRecord } from '../domain/types';
import { phaseOf, progressOf } from '../services/steps';
import { IconAdd, IconBolt, IconSearch, ProgressRing, SourceIcon, Stars } from './icons';

function matches(card: KnowledgeCard, q: string): boolean {
  const haystack = [
    card.titulo,
    card.resumenCorto,
    card.resumenDetallado,
    card.ideaPrincipal,
    card.categoria,
    ...(card.etiquetas ?? []),
    ...(card.herramientas ?? []),
    ...(card.webs ?? []),
    ...(card.apps ?? []),
    ...(card.libros ?? []),
    ...(card.personas ?? []),
    ...(card.empresas ?? []),
    ...(card.conceptos ?? []),
    ...(card.aprendizajes ?? []),
    ...(card.consejos ?? []),
  ]
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((term) => haystack.includes(term));
}

export function Library({
  cards,
  steps,
  onOpen,
  onImport,
}: {
  cards: KnowledgeCard[];
  steps: StepRecord[];
  onOpen: (id: string) => void;
  onImport: () => void;
}) {
  const [query, setQuery] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [nivel, setNivel] = useState<string | null>(null);
  const [sinAplicar, setSinAplicar] = useState(false);

  const categorias = useMemo(
    () => [...new Set(cards.map((c) => c.categoria).filter(Boolean))].sort(),
    [cards]
  );

  const visible = cards.filter(
    (c) =>
      (!query.trim() || matches(c, query.trim())) &&
      (!categoria || c.categoria === categoria) &&
      (!nivel || c.nivel === nivel) &&
      (!sinAplicar || phaseOf(steps, c.id) !== 'aplicada')
  );

  const hayFiltro = Boolean(categoria || nivel || sinAplicar || query.trim());

  if (cards.length === 0) {
    return (
      <div className="empty-state">
        <h2>Tu biblioteca está vacía</h2>
        <p>
          Pega un Reel, un vídeo de YouTube o un texto y Bibliotheke lo destila en una ficha: la idea principal, lo que
          conviene verificar y cinco micropasos para aplicarlo.
        </p>
        <button className="btn primary" onClick={onImport}>
          <IconAdd size={18} /> Añadir la primera
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="search-row">
        <div className="search-field">
          <IconSearch size={17} />
          <input
            className="input"
            type="search"
            placeholder="Buscar en tu biblioteca"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar en tu biblioteca"
          />
        </div>
        <button className="btn primary square" onClick={onImport} aria-label="Añadir conocimiento">
          <IconAdd size={20} />
        </button>
      </div>

      <div className="filters" role="group" aria-label="Filtros">
        <button
          className={`chip-filter ${sinAplicar ? 'on' : ''}`}
          onClick={() => setSinAplicar(!sinAplicar)}
          aria-pressed={sinAplicar}
        >
          <IconBolt size={13} /> Sin aplicar
        </button>
        {categorias.map((cat) => (
          <button
            key={cat}
            className={`chip-filter ${categoria === cat ? 'on' : ''}`}
            onClick={() => setCategoria(categoria === cat ? null : cat)}
            aria-pressed={categoria === cat}
          >
            {cat}
          </button>
        ))}
        {(['básico', 'intermedio', 'avanzado'] as const).map((n) => (
          <button
            key={n}
            className={`chip-filter ${nivel === n ? 'on' : ''}`}
            onClick={() => setNivel(nivel === n ? null : n)}
            aria-pressed={nivel === n}
          >
            {n}
          </button>
        ))}
      </div>

      <p className="result-count" aria-live="polite">
        {hayFiltro ? `${visible.length} de ${cards.length} fichas` : `${cards.length} fichas`}
      </p>

      {visible.length === 0 ? (
        <div className="empty-state compact">
          <p>Ninguna ficha coincide con lo que buscas.</p>
          {hayFiltro && (
            <button
              className="btn"
              onClick={() => {
                setQuery('');
                setCategoria(null);
                setNivel(null);
                setSinAplicar(false);
              }}
            >
              Quitar filtros
            </button>
          )}
        </div>
      ) : (
        <ul className="card-list stack">
          {visible.map((card) => {
            const { hechos, total } = progressOf(steps, card.id);
            const fase = phaseOf(steps, card.id);
            return (
              <li key={card.id}>
                <button className={`card-item fase-${fase}`} onClick={() => onOpen(card.id)}>
                  <span className="card-head">
                    <span className="card-source" aria-hidden="true">
                      <SourceIcon tipo={card.fuente.tipo} size={15} />
                    </span>
                    <span className="card-title">{card.titulo}</span>
                    {hechos > 0 && <ProgressRing done={hechos} total={total} />}
                  </span>
                  <span className="card-summary">{card.resumenCorto}</span>
                  <span className="card-meta">
                    <Stars value={Math.round((card.evaluacion?.utilidad ?? 0) / 2)} />
                    {card.categoria && <span className="chip accent">{card.categoria}</span>}
                    <span className="chip">{card.nivel}</span>
                    <span className="card-date">
                      {new Date(card.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
