import { useMemo, useState } from 'react';
import type { KnowledgeCard } from '../domain/types';

const SOURCE_ICON: Record<string, string> = { video: '🎞️', youtube: '▶️', texto: '📄' };

function matches(card: KnowledgeCard, q: string): boolean {
  const haystack = [
    card.titulo,
    card.resumenCorto,
    card.resumenDetallado,
    card.ideaPrincipal,
    card.categoria,
    ...card.etiquetas,
    ...card.herramientas,
    ...card.webs,
    ...card.apps,
    ...card.libros,
    ...card.personas,
    ...card.empresas,
    ...card.conceptos,
    ...card.aprendizajes,
    ...card.consejos,
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
  onOpen,
  onImport,
}: {
  cards: KnowledgeCard[];
  onOpen: (id: string) => void;
  onImport: () => void;
}) {
  const [query, setQuery] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [nivel, setNivel] = useState<string | null>(null);

  const categorias = useMemo(
    () => [...new Set(cards.map((c) => c.categoria).filter(Boolean))].sort(),
    [cards]
  );

  const visible = cards.filter(
    (c) =>
      (!query.trim() || matches(c, query.trim())) &&
      (!categoria || c.categoria === categoria) &&
      (!nivel || c.nivel === nivel)
  );

  if (cards.length === 0) {
    return (
      <div className="empty-state">
        <div className="big">📚</div>
        <h2 style={{ marginBottom: 8 }}>Tu biblioteca está vacía</h2>
        <p>Añade tu primer Reel, vídeo de YouTube o texto y conviértelo en conocimiento.</p>
        <button className="btn primary" onClick={onImport}>
          + Añadir conocimiento
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="search-row">
        <input
          className="input"
          placeholder="Buscar: n8n, inversión, prompts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn primary" onClick={onImport}>
          + Añadir
        </button>
      </div>

      <div className="filters">
        {categorias.map((cat) => (
          <button
            key={cat}
            className={`chip-filter ${categoria === cat ? 'on' : ''}`}
            onClick={() => setCategoria(categoria === cat ? null : cat)}
          >
            {cat}
          </button>
        ))}
        {(['básico', 'intermedio', 'avanzado'] as const).map((n) => (
          <button
            key={n}
            className={`chip-filter ${nivel === n ? 'on' : ''}`}
            onClick={() => setNivel(nivel === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="hint" style={{ textAlign: 'center', padding: 30 }}>
          Ninguna ficha coincide con la búsqueda.
        </p>
      )}

      {visible.map((card) => {
        const stars = Math.round(card.evaluacion.utilidad / 2);
        return (
          <button key={card.id} className="card-item" onClick={() => onOpen(card.id)}>
            <h3>
              {SOURCE_ICON[card.fuente.tipo] ?? '📄'} {card.titulo}
            </h3>
            <div className="summary">{card.resumenCorto}</div>
            <div className="meta">
              <span className="stars">{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</span>
              {card.categoria && <span className="chip accent">{card.categoria}</span>}
              <span className="chip">{card.nivel}</span>
              {card.etiquetas.slice(0, 3).map((tag) => (
                <span key={tag} className="chip">#{tag}</span>
              ))}
              <span className="date">
                {new Date(card.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
