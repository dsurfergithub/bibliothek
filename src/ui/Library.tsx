import { useMemo, type ReactNode } from 'react';
import type { KnowledgeCard, SourceKind, StepRecord } from '../domain/types';
import { fold } from '../domain/text';
import { phaseOf, progressOf } from '../services/steps';
import { IconAdd, IconBolt, IconEye, IconSearch, ProgressRing, SourceIcon, Stars } from './icons';

/**
 * Todo el texto de la ficha, incluidas tus notas, los prompts, los métodos, el
 * análisis crítico y la fuente. Antes solo se buscaba en una parte y una nota
 * propia o un prompt guardado no aparecían.
 */
function haystackOf(card: KnowledgeCard): string {
  const partes: string[] = [card.notas, card.fuente?.referencia ?? ''];
  for (const v of Object.values(card)) {
    if (typeof v === 'string') partes.push(v);
    else if (Array.isArray(v)) for (const x of v) if (typeof x === 'string') partes.push(x);
  }
  return fold(partes.join(' \n '));
}

function matches(haystack: string, q: string): boolean {
  return fold(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

/** Estado de la biblioteca que sobrevive a abrir una ficha y volver (vive en `App`). */
export interface LibraryFilters {
  query: string;
  categoria: string | null;
  nivel: string | null;
  fuente: SourceKind | null;
  sinAplicar: boolean;
  sinVer: boolean;
}

export const NO_FILTERS: LibraryFilters = {
  query: '',
  categoria: null,
  nivel: null,
  fuente: null,
  sinAplicar: false,
  sinVer: false,
};

const FUENTE_LABEL: Record<SourceKind, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  video: 'Vídeo',
  texto: 'Texto',
};

export function Library({
  cards,
  steps,
  filters,
  onFilters,
  onOpen,
  onImport,
}: {
  cards: KnowledgeCard[];
  steps: StepRecord[];
  filters: LibraryFilters;
  onFilters: (f: LibraryFilters) => void;
  onOpen: (id: string) => void;
  onImport: () => void;
}) {
  const { query, categoria, nivel, fuente, sinAplicar, sinVer } = filters;
  const set = (patch: Partial<LibraryFilters>) => onFilters({ ...filters, ...patch });

  const categorias = useMemo(
    () => [...new Set(cards.map((c) => c.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [cards]
  );
  const fuentes = useMemo(() => [...new Set(cards.map((c) => c.fuente.tipo))], [cards]);
  const haystacks = useMemo(() => new Map(cards.map((c) => [c.id, haystackOf(c)])), [cards]);

  const visible = cards.filter(
    (c) =>
      (!query.trim() || matches(haystacks.get(c.id) ?? '', query.trim())) &&
      (!categoria || c.categoria === categoria) &&
      (!nivel || c.nivel === nivel) &&
      (!fuente || c.fuente.tipo === fuente) &&
      (!sinAplicar || phaseOf(steps, c.id) !== 'aplicada') &&
      (!sinVer || !c.vistoAt)
  );

  const hayFiltro = Boolean(categoria || nivel || fuente || sinAplicar || sinVer || query.trim());

  if (cards.length === 0) {
    return (
      <div className="empty-state">
        <h2>Tu biblioteca está vacía</h2>
        <p>
          Pega un Reel, un vídeo de YouTube o un texto y Bibliotheke lo destila en una ficha: la idea principal, lo que
          conviene verificar y unos pocos micropasos para aplicarlo.
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
            placeholder="Busca en fichas, notas y prompts"
            value={query}
            onChange={(e) => set({ query: e.target.value })}
            aria-label="Buscar en tu biblioteca"
          />
        </div>
        <button className="btn primary square" onClick={onImport} aria-label="Añadir conocimiento">
          <IconAdd size={20} />
        </button>
      </div>

      <div className="filter-groups">
        <FilterGroup label="Estado">
          <button className={`chip-filter ${sinAplicar ? 'on' : ''}`} onClick={() => set({ sinAplicar: !sinAplicar })} aria-pressed={sinAplicar}>
            <IconBolt size={13} /> Sin aplicar
          </button>
          <button className={`chip-filter ${sinVer ? 'on' : ''}`} onClick={() => set({ sinVer: !sinVer })} aria-pressed={sinVer}>
            <IconEye size={13} /> Sin ver
          </button>
        </FilterGroup>
        {categorias.length > 1 && (
          <FilterGroup label="Tema">
            {categorias.map((cat) => (
              <button
                key={cat}
                className={`chip-filter ${categoria === cat ? 'on' : ''}`}
                onClick={() => set({ categoria: categoria === cat ? null : cat })}
                aria-pressed={categoria === cat}
              >
                {cat}
              </button>
            ))}
          </FilterGroup>
        )}
        {fuentes.length > 1 && (
          <FilterGroup label="Fuente">
            {fuentes.map((f) => (
              <button
                key={f}
                className={`chip-filter ${fuente === f ? 'on' : ''}`}
                onClick={() => set({ fuente: fuente === f ? null : f })}
                aria-pressed={fuente === f}
              >
                <SourceIcon tipo={f} size={13} /> {FUENTE_LABEL[f]}
              </button>
            ))}
          </FilterGroup>
        )}
        <FilterGroup label="Nivel">
          {(['básico', 'intermedio', 'avanzado'] as const).map((n) => (
            <button
              key={n}
              className={`chip-filter ${nivel === n ? 'on' : ''}`}
              onClick={() => set({ nivel: nivel === n ? null : n })}
              aria-pressed={nivel === n}
            >
              {n}
            </button>
          ))}
        </FilterGroup>
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
              onClick={() => onFilters(NO_FILTERS)}
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
                    {card.vistoAt && (
                      <span className="card-vista" title="Vista" aria-label="Vista">
                        <IconEye size={14} />
                      </span>
                    )}
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

/** Una fila de filtros con su nombre: tema, fuente, estado y nivel ya no se mezclan en una sola tira. */
function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="filter-group" role="group" aria-label={label}>
      <span className="filter-label">{label}</span>
      <div className="filters">{children}</div>
    </div>
  );
}
