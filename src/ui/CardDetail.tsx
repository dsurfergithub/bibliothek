import { useState } from 'react';
import { LIST_SECTIONS, type KnowledgeCard } from '../domain/types';
import { cardToMarkdown, downloadText, slugify } from '../services/exporters';
import { deleteCard, saveCard } from '../services/db';

export function CardDetail({
  card,
  onBack,
  onChanged,
}: {
  card: KnowledgeCard;
  onBack: () => void;
  onChanged: (card: KnowledgeCard | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const e = card.evaluacion;
  const stars = Math.round(e.utilidad / 2);

  async function copyMarkdown() {
    await navigator.clipboard.writeText(cardToMarkdown(card));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    const md = cardToMarkdown(card);
    if (navigator.share) {
      await navigator.share({ title: card.titulo, text: md }).catch(() => {});
    } else {
      await copyMarkdown();
    }
  }

  async function remove() {
    if (!confirm('¿Eliminar esta ficha de tu biblioteca?')) return;
    await deleteCard(card.id);
    onChanged(null);
  }

  if (editing) {
    return <CardEditor card={card} onCancel={() => setEditing(false)} onSave={async (updated) => {
      await saveCard(updated);
      onChanged(updated);
      setEditing(false);
    }} />;
  }

  return (
    <div>
      <button className="btn small" onClick={onBack} style={{ marginBottom: 16 }}>
        ← Biblioteca
      </button>

      <div className="detail-header">
        <h1>{card.titulo}</h1>
        <div className="chip-row" style={{ marginTop: 10 }}>
          <span className="chip accent">{card.categoria}</span>
          <span className="chip">{card.nivel}</span>
          <span className="chip">{card.fuente.tipo}: {card.fuente.referencia.slice(0, 40)}</span>
          {card.etiquetas.map((t) => (
            <span key={t} className="chip">#{t}</span>
          ))}
        </div>
      </div>

      <div className="detail-idea">{card.ideaPrincipal}</div>

      <div className="detail-actions">
        <button className="btn small" onClick={copyMarkdown}>{copied ? '✓ Copiado' : '📋 Copiar MD'}</button>
        <button
          className="btn small"
          onClick={() => downloadText(`${slugify(card.titulo)}.md`, cardToMarkdown(card), 'text/markdown')}
        >
          ⬇️ Markdown
        </button>
        <button
          className="btn small"
          onClick={() => downloadText(`${slugify(card.titulo)}.json`, JSON.stringify(card, null, 2), 'application/json')}
        >
          ⬇️ JSON
        </button>
        <button className="btn small" onClick={share}>↗️ Compartir</button>
        <button className="btn small" onClick={() => setEditing(true)}>✏️ Editar</button>
        <button className="btn small danger" onClick={remove}>🗑️</button>
      </div>

      <div className="eval-grid">
        <div className="eval-tile">
          <div className="label">Valoración</div>
          <div className="value">{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</div>
        </div>
        <div className="eval-tile"><div className="label">Utilidad</div><div className="value">{e.utilidad}/10</div></div>
        <div className="eval-tile"><div className="label">Accionable</div><div className="value">{e.accionable}/10</div></div>
        <div className="eval-tile"><div className="label">Originalidad</div><div className="value">{e.originalidad}/10</div></div>
        <div className="eval-tile"><div className="label">Claridad</div><div className="value">{e.claridad}/10</div></div>
        <div className="eval-tile"><div className="label">Fiabilidad</div><div className="value plain">{e.fiabilidad}</div></div>
        <div className="eval-tile"><div className="label">Ahorra</div><div className="value plain">~{e.tiempoAhorradoMin} min</div></div>
        <div className="eval-tile">
          <div className="label">¿Guardar?</div>
          <div className="value plain">{e.mereceGuardarse ? 'Sí ✓' : 'No'}</div>
        </div>
      </div>

      {e.necesitaVerificacion && e.afirmacionesDudosas.length > 0 && (
        <div className="warn-box">
          <div className="title">⚠️ Afirmaciones que conviene verificar</div>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {e.afirmacionesDudosas.map((claim, i) => (
              <li key={i}>{claim}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="section">
        <h2>Resumen</h2>
        <p><strong>{card.resumenCorto}</strong></p>
        <p>{card.resumenDetallado}</p>
        <p className="hint">Lectura: ~{card.tiempoLecturaMin} min · Idioma original: {card.idioma}</p>
      </div>

      {LIST_SECTIONS.map(({ key, label }) => {
        const items = card[key] as string[];
        if (items.length === 0) return null;
        return (
          <div className="section" key={key}>
            <h2>{label}</h2>
            {key === 'prompts' ? (
              items.map((p, i) => <div className="prompt-block" key={i}>{p}</div>)
            ) : (
              <ul>
                {items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {card.notas.trim() && (
        <div className="section">
          <h2>Mis notas</h2>
          <p style={{ whiteSpace: 'pre-wrap' }}>{card.notas}</p>
        </div>
      )}
    </div>
  );
}

function CardEditor({
  card,
  onSave,
  onCancel,
}: {
  card: KnowledgeCard;
  onSave: (card: KnowledgeCard) => void;
  onCancel: () => void;
}) {
  const [titulo, setTitulo] = useState(card.titulo);
  const [resumenCorto, setResumenCorto] = useState(card.resumenCorto);
  const [categoria, setCategoria] = useState(card.categoria);
  const [etiquetas, setEtiquetas] = useState(card.etiquetas.join(', '));
  const [nivel, setNivel] = useState(card.nivel);
  const [notas, setNotas] = useState(card.notas);

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Editar ficha</h1>
      <div className="field">
        <label>Título</label>
        <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </div>
      <div className="field">
        <label>Resumen corto</label>
        <textarea className="textarea" rows={3} value={resumenCorto} onChange={(e) => setResumenCorto(e.target.value)} />
      </div>
      <div className="field">
        <label>Categoría</label>
        <input className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)} />
      </div>
      <div className="field">
        <label>Etiquetas (separadas por comas)</label>
        <input className="input" value={etiquetas} onChange={(e) => setEtiquetas(e.target.value)} />
      </div>
      <div className="field">
        <label>Nivel</label>
        <select className="select" value={nivel} onChange={(e) => setNivel(e.target.value as typeof nivel)}>
          <option value="básico">básico</option>
          <option value="intermedio">intermedio</option>
          <option value="avanzado">avanzado</option>
        </select>
      </div>
      <div className="field">
        <label>Mis notas</label>
        <textarea className="textarea" rows={5} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="btn primary"
          onClick={() =>
            onSave({
              ...card,
              titulo: titulo.trim() || card.titulo,
              resumenCorto,
              categoria: categoria.trim(),
              etiquetas: etiquetas.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean),
              nivel,
              notas,
            })
          }
        >
          Guardar cambios
        </button>
        <button className="btn" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
