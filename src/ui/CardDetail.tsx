import { useState } from 'react';
import { LIST_SECTIONS, PRACTICE_KEYS, type KnowledgeCard, type StepRecord } from '../domain/types';
import { cardToMarkdown, downloadText, slugify } from '../services/exporters';
import { deleteCard, saveCard } from '../services/db';
import { recordShare } from '../services/stats';
import { setStepState, stepsOf } from '../services/steps';
import {
  IconBack,
  IconCheck,
  IconChevron,
  IconCopy,
  IconDownload,
  IconEdit,
  IconShare,
  IconTrash,
  IconWarning,
  SourceIcon,
  Stars,
} from './icons';

export function CardDetail({
  card,
  steps,
  onBack,
  onChanged,
  onStepsChanged,
}: {
  card: KnowledgeCard;
  steps: StepRecord[];
  onBack: () => void;
  onChanged: (card: KnowledgeCard | null) => void;
  onStepsChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [abierta, setAbierta] = useState(false);
  const e = card.evaluacion;
  const pasos = stepsOf(steps, card.id);

  async function copyMarkdown() {
    await navigator.clipboard.writeText(cardToMarkdown(card, pasos));
    recordShare(card);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    const md = cardToMarkdown(card, pasos);
    if (navigator.share) {
      await navigator.share({ title: card.titulo, text: md }).catch(() => {});
      recordShare(card);
    } else {
      await copyMarkdown();
    }
  }

  function download(filename: string, content: string, mime: string) {
    downloadText(filename, content, mime);
    recordShare(card);
  }

  async function remove() {
    if (!confirm('¿Eliminar esta ficha de tu biblioteca?')) return;
    await deleteCard(card.id);
    onChanged(null);
  }

  if (editing) {
    return (
      <CardEditor
        card={card}
        onCancel={() => setEditing(false)}
        onSave={async (updated) => {
          await saveCard(updated);
          onChanged(updated);
          setEditing(false);
        }}
      />
    );
  }

  // Las listas del análisis, salvo las que ya viven en el bloque de práctica.
  const secciones = LIST_SECTIONS.filter(
    ({ key }) => !PRACTICE_KEYS.includes(key) && (card[key] as string[] | undefined)?.length
  );

  return (
    <div>
      <button className="btn ghost back" onClick={onBack}>
        <IconBack size={17} /> Biblioteca
      </button>

      <header className="detail-header">
        <h1>{card.titulo}</h1>
        <div className="detail-sub">
          <span className="src">
            <SourceIcon tipo={card.fuente.tipo} size={14} /> {card.fuente.tipo}
          </span>
          <Stars value={Math.round((e?.utilidad ?? 0) / 2)} />
          <span aria-hidden="true">·</span>
          <span>
            {new Date(card.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
        <div className="chip-row">
          {card.categoria && <span className="chip accent">{card.categoria}</span>}
          <span className="chip">{card.nivel}</span>
          {(card.etiquetas ?? []).map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
      </header>

      <blockquote className="detail-idea">{card.ideaPrincipal}</blockquote>

      <PracticeBlock
        pasos={pasos}
        onToggle={async (paso) => {
          await setStepState(paso, paso.estado === 'hecho' ? 'pendiente' : 'hecho');
          onStepsChanged();
        }}
      />

      <div className="toolbar" role="group" aria-label="Acciones de la ficha">
        <button className="btn ghost" onClick={copyMarkdown}>
          {copied ? <IconCheck size={16} /> : <IconCopy size={16} />} {copied ? 'Copiado' : 'Copiar'}
        </button>
        <button
          className="btn ghost"
          onClick={() => download(`${slugify(card.titulo)}.md`, cardToMarkdown(card, pasos), 'text/markdown')}
        >
          <IconDownload size={16} /> Markdown
        </button>
        <button className="btn ghost" onClick={share}>
          <IconShare size={16} /> Compartir
        </button>
        <button className="btn ghost" onClick={() => setEditing(true)}>
          <IconEdit size={16} /> Editar
        </button>
        <button className="btn ghost danger" onClick={remove} aria-label="Eliminar ficha">
          <IconTrash size={16} />
        </button>
      </div>

      {e?.necesitaVerificacion && e.afirmacionesDudosas?.length > 0 && (
        <div className="warn-box">
          <div className="title">
            <IconWarning size={16} /> Conviene verificar
          </div>
          <ul>
            {e.afirmacionesDudosas.map((claim, i) => (
              <li key={i}>{claim}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="section">
        <h2>Resumen</h2>
        <p className="lead">{card.resumenCorto}</p>
        <p>{card.resumenDetallado}</p>
        <p className="hint">
          Lectura ~{card.tiempoLecturaMin} min · idioma original {card.idioma} · ahorra ~{e?.tiempoAhorradoMin} min
          frente al contenido original
        </p>
      </section>

      {card.analisisCritico?.trim() && (
        <section className="section">
          <h2>Análisis crítico</h2>
          <p className="prewrap">{card.analisisCritico}</p>
        </section>
      )}

      {e && <Evaluacion e={e} />}

      {card.notas?.trim() && (
        <section className="section">
          <h2>Mis notas</h2>
          <p className="prewrap">{card.notas}</p>
        </section>
      )}

      {secciones.length > 0 && (
        <>
          <button className="disclosure" onClick={() => setAbierta(!abierta)} aria-expanded={abierta}>
            <IconChevron size={18} className={abierta ? 'open' : ''} />
            {abierta ? 'Ocultar la ficha completa' : `Ver la ficha completa · ${secciones.length} secciones`}
          </button>
          {abierta && (
            <div className="full-card">
              {secciones.map(({ key, label }) => {
                const items = card[key] as string[];
                return (
                  <section className="section" key={key}>
                    <h2>{label}</h2>
                    {key === 'prompts' ? (
                      items.map((p, i) => (
                        <div className="prompt-block" key={i}>
                          {p}
                        </div>
                      ))
                    ) : (
                      <ul>
                        {items.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Los 5 micropasos, marcables. Es el bloque que convierte la ficha en algo que
 * se hace, no que se lee: por eso va arriba y no enterrado entre las listas.
 */
function PracticeBlock({
  pasos,
  onToggle,
}: {
  pasos: StepRecord[];
  onToggle: (paso: StepRecord) => void;
}) {
  if (pasos.length === 0) return null;
  const hechos = pasos.filter((p) => p.estado === 'hecho').length;
  const completa = hechos >= pasos.length;

  return (
    <section className="practice-block">
      <div className="practice-head">
        <h2>Aplicar esto</h2>
        <span className={`prog-label ${completa ? 'full' : ''}`}>
          {hechos}/{pasos.length}
        </span>
      </div>
      <div className="prog-bar" aria-label={`${hechos} de ${pasos.length} micropasos aplicados`}>
        <span style={{ width: `${(hechos / pasos.length) * 100}%` }} />
      </div>
      <ul className="step-list">
        {pasos.map((paso) => (
          <li key={paso.id} className={paso.estado}>
            <button className="step-check" onClick={() => onToggle(paso)} aria-pressed={paso.estado === 'hecho'}>
              <span className="box" aria-hidden="true">
                {paso.estado === 'hecho' && <IconCheck size={13} />}
              </span>
              <span className="txt">
                <span className="paso">{paso.texto}</span>
                {paso.checklist && <span className="criterio">Hecho cuando: {paso.checklist}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Las cuatro notas del análisis como medidores, no como ocho azulejos iguales. */
function Evaluacion({ e }: { e: KnowledgeCard['evaluacion'] }) {
  const metricas: [string, number][] = [
    ['Utilidad', e.utilidad],
    ['Accionable', e.accionable],
    ['Originalidad', e.originalidad],
    ['Claridad', e.claridad],
  ];
  return (
    <section className="section">
      <h2>Cómo lo puntúa el análisis</h2>
      <div className="meters">
        {metricas.map(([label, v]) => (
          <div className="meter" key={label}>
            <span className="meter-label">{label}</span>
            <span className="meter-track" aria-hidden="true">
              <span style={{ width: `${(v / 10) * 100}%` }} />
            </span>
            <span className="meter-value">{v}</span>
          </div>
        ))}
      </div>
      <p className="hint">
        Fiabilidad <strong className={`fiab-text-${e.fiabilidad}`}>{e.fiabilidad}</strong>
        {' · '}
        {e.mereceGuardarse ? 'el análisis la recomienda' : 'el análisis no la recomendaba'}
      </p>
    </section>
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
  const [etiquetas, setEtiquetas] = useState((card.etiquetas ?? []).join(', '));
  const [nivel, setNivel] = useState(card.nivel);
  const [notas, setNotas] = useState(card.notas);

  return (
    <div>
      <h1 className="view-title">Editar ficha</h1>
      <div className="field">
        <label htmlFor="ed-titulo">Título</label>
        <input id="ed-titulo" className="input" value={titulo} onChange={(ev) => setTitulo(ev.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="ed-resumen">Resumen corto</label>
        <textarea
          id="ed-resumen"
          className="textarea"
          rows={3}
          value={resumenCorto}
          onChange={(ev) => setResumenCorto(ev.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="ed-cat">Categoría</label>
        <input id="ed-cat" className="input" value={categoria} onChange={(ev) => setCategoria(ev.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="ed-tags">Etiquetas (separadas por comas)</label>
        <input id="ed-tags" className="input" value={etiquetas} onChange={(ev) => setEtiquetas(ev.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="ed-nivel">Nivel</label>
        <select
          id="ed-nivel"
          className="select"
          value={nivel}
          onChange={(ev) => setNivel(ev.target.value as typeof nivel)}
        >
          <option value="básico">básico</option>
          <option value="intermedio">intermedio</option>
          <option value="avanzado">avanzado</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="ed-notas">Mis notas</label>
        <textarea
          id="ed-notas"
          className="textarea"
          rows={5}
          value={notas}
          onChange={(ev) => setNotas(ev.target.value)}
        />
      </div>
      <div className="actions-row">
        <button
          className="btn primary"
          onClick={() =>
            onSave({
              ...card,
              titulo: titulo.trim() || card.titulo,
              resumenCorto,
              categoria: categoria.trim(),
              etiquetas: etiquetas
                .split(',')
                .map((t) => t.trim().replace(/^#/, ''))
                .filter(Boolean),
              nivel,
              notas,
            })
          }
        >
          Guardar cambios
        </button>
        <button className="btn" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
