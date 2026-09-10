import { useEffect, useMemo, useRef, useState } from 'react';
import type { KnowledgeCard, StepRecord } from '../domain/types';
import {
  availableSteps,
  doneToday,
  markOffered,
  pickStep,
  progressOf,
  setStepState,
  type DiceFilter,
  type StepPick,
} from '../services/steps';

/**
 * El Dado: práctica sin decidir. En vez de mirar la biblioteca entera y elegir
 * (que es donde muere la buena intención), la app te sirve UN micropaso y te
 * dice por qué te toca ese. Cuatro respuestas y a otra cosa.
 */

const CARAS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const ROLL_MS = 620;

type Fase = 'idle' | 'rolling' | 'step' | 'done';

export function Practice({
  cards,
  steps,
  onChanged,
  onOpenCard,
}: {
  cards: KnowledgeCard[];
  steps: StepRecord[];
  onChanged: () => void;
  onOpenCard: (id: string) => void;
}) {
  const [fase, setFase] = useState<Fase>('idle');
  const [pick, setPick] = useState<StepPick | null>(null);
  const [cara, setCara] = useState(0);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [soloFaciles, setSoloFaciles] = useState(false);
  const timers = useRef<number[]>([]);

  // Los temporizadores no deben sobrevivir a la vista (iOS congela pestañas).
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const filtro: DiceFilter = { categoria, soloFaciles };
  const disponibles = useMemo(() => availableSteps(steps, cards, filtro), [steps, cards, categoria, soloFaciles]);
  const hoy = doneToday(steps);
  const totalHechos = steps.filter((s) => s.estado === 'hecho').length;

  const categorias = useMemo(
    () => [...new Set(cards.map((c) => c.categoria).filter(Boolean))].sort(),
    [cards]
  );

  function tirar(excluirId?: string) {
    const elegido = pickStep(steps, cards, filtro, excluirId);
    if (!elegido) {
      setPick(null);
      setFase('idle');
      return;
    }
    setFase('rolling');
    let n = 0;
    const gira = window.setInterval(() => setCara(++n % CARAS.length), 90);
    const fin = window.setTimeout(() => {
      clearInterval(gira);
      setPick(elegido);
      setFase('step');
      void markOffered(elegido.step).then(onChanged);
    }, ROLL_MS);
    timers.current.push(gira, fin);
  }

  async function responder(estado: 'hecho' | 'descartado' | 'aplazado') {
    if (!pick) return;
    await setStepState(pick.step, estado);
    onChanged();
    if (estado === 'hecho') setFase('done');
    else tirar(pick.step.id);
  }

  if (cards.length === 0) {
    return (
      <div className="empty-state">
        <div className="big">🎲</div>
        <h2>Nada que practicar todavía</h2>
        <p>Cada ficha que añadas trae 5 micropasos. El Dado te irá sirviendo uno cada vez para que apliques lo que guardas.</p>
      </div>
    );
  }

  return (
    <div className="practice">
      <div className="practice-top">
        <div>
          <h1>Práctica</h1>
          <p className="hint">Un micropaso cada vez. Sin elegir, sin excusas.</p>
        </div>
        <div className="today-pill" title="Micropasos aplicados hoy">
          <span className="n">{hoy}</span>
          <span className="l">hoy</span>
        </div>
      </div>

      {fase === 'step' && pick ? (
        <StepCard
          pick={pick}
          steps={steps}
          onOpenCard={onOpenCard}
          onResponder={responder}
          onOtro={() => tirar(pick.step.id)}
        />
      ) : fase === 'done' && pick ? (
        <DoneCard
          pick={pick}
          steps={steps}
          quedan={disponibles.length}
          onOpenCard={onOpenCard}
          onOtro={() => tirar(pick.step.id)}
          onVolver={() => setFase('idle')}
        />
      ) : (
        <div className={`dice-stage ${fase === 'rolling' ? 'rolling' : ''}`}>
          <div className="dice-face" aria-hidden="true">
            {fase === 'rolling' ? CARAS[cara] : '🎲'}
          </div>

          {disponibles.length === 0 ? (
            <div className="dice-empty">
              <p>
                {steps.length === 0
                  ? 'Estas fichas se guardaron antes de que existieran los micropasos y no traen ninguno.'
                  : categoria || soloFaciles
                    ? 'No queda ningún paso con estos filtros.'
                    : `Has despachado los ${totalHechos} micropasos de tu biblioteca. Añade una ficha nueva.`}
              </p>
              {(categoria || soloFaciles) && (
                <button
                  className="btn"
                  onClick={() => {
                    setCategoria(null);
                    setSoloFaciles(false);
                  }}
                >
                  Quitar filtros
                </button>
              )}
            </div>
          ) : (
            <button className="btn primary dice-btn" onClick={() => tirar()} disabled={fase === 'rolling'}>
              {fase === 'rolling' ? 'Tirando…' : 'Dame un micropaso'}
            </button>
          )}

          <p className="dice-count">
            {disponibles.length} paso{disponibles.length === 1 ? '' : 's'} disponible
            {disponibles.length === 1 ? '' : 's'}
            {totalHechos > 0 && ` · ${totalHechos} aplicado${totalHechos === 1 ? '' : 's'} en total`}
          </p>

          <div className="dice-filters">
            <button
              className={`chip-filter ${soloFaciles ? 'on' : ''}`}
              onClick={() => setSoloFaciles(!soloFaciles)}
            >
              ⚡ Solo fáciles
            </button>
            {categorias.map((cat) => (
              <button
                key={cat}
                className={`chip-filter ${categoria === cat ? 'on' : ''}`}
                onClick={() => setCategoria(categoria === cat ? null : cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StepCard({
  pick,
  steps,
  onOpenCard,
  onResponder,
  onOtro,
}: {
  pick: StepPick;
  steps: StepRecord[];
  onOpenCard: (id: string) => void;
  onResponder: (estado: 'hecho' | 'descartado' | 'aplazado') => void;
  onOtro: () => void;
}) {
  const { hechos, total } = progressOf(steps, pick.card.id);
  return (
    <div className="step-card spring-in">
      <button className="step-source" onClick={() => onOpenCard(pick.card.id)}>
        <span className="cat">{pick.card.categoria || 'Sin categoría'}</span>
        <span className="titulo">{pick.card.titulo}</span>
        <span className="prog">
          {hechos}/{total}
        </span>
      </button>

      <p className="step-why">{pick.razon}</p>

      <p className="step-text">{pick.step.texto}</p>

      {pick.step.checklist && (
        <p className="step-criterio">
          <span className="label">Hecho cuando</span>
          {pick.step.checklist}
        </p>
      )}

      <div className="step-actions">
        <button className="btn primary big" onClick={() => onResponder('hecho')}>
          ✓ Hecho
        </button>
        <div className="row">
          <button className="btn" onClick={onOtro}>
            ⏭️ Otro
          </button>
          <button className="btn" onClick={() => onResponder('aplazado')}>
            😴 Ahora no
          </button>
          <button className="btn" onClick={() => onResponder('descartado')}>
            🚫 No aplica
          </button>
        </div>
      </div>
      <p className="hint step-legend">
        «Ahora no» lo aparta un par de días. «No aplica» lo retira para siempre.
      </p>
    </div>
  );
}

function DoneCard({
  pick,
  steps,
  quedan,
  onOpenCard,
  onOtro,
  onVolver,
}: {
  pick: StepPick;
  steps: StepRecord[];
  quedan: number;
  onOpenCard: (id: string) => void;
  onOtro: () => void;
  onVolver: () => void;
}) {
  const { hechos, total } = progressOf(steps, pick.card.id);
  const completa = total > 0 && hechos >= total;
  return (
    <div className="step-card done spring-in">
      <div className="done-mark" aria-hidden="true">
        ✓
      </div>
      <h2 className="done-title">{completa ? 'Ficha aplicada entera' : 'Un paso menos'}</h2>
      <p className="done-sub">
        {completa
          ? `Has completado los ${total} micropasos de "${pick.card.titulo}". Eso ya no es contenido guardado: es algo que hiciste.`
          : `${hechos} de ${total} pasos de "${pick.card.titulo}".`}
      </p>
      <div className="prog-bar" aria-label={`${hechos} de ${total}`}>
        <span style={{ width: `${total ? (hechos / total) * 100 : 0}%` }} />
      </div>
      <div className="step-actions">
        {quedan > 0 && (
          <button className="btn primary big" onClick={onOtro}>
            🎲 Otro micropaso
          </button>
        )}
        <div className="row">
          <button className="btn" onClick={() => onOpenCard(pick.card.id)}>
            Ver la ficha
          </button>
          <button className="btn" onClick={onVolver}>
            Dejarlo aquí
          </button>
        </div>
      </div>
    </div>
  );
}
