import { useMemo, useState } from 'react';
import type { KnowledgeCard, StepRecord } from '../domain/types';
import { listShares } from '../services/stats';
import { appliedCritique, appliedStats } from '../services/analytics';
import { IconBolt, IconChevron, IconDice, SourceIcon } from './icons';

/**
 * Insights, en dos mitades que responden a dos preguntas distintas:
 *
 * - **Guardado**: qué tipo de conocimiento entra en la biblioteca (categorías,
 *   fuentes, fiabilidad, actividad). Es la radiografía de lo que consumes.
 * - **Aplicado**: qué has llegado a hacer con él. Es la única mitad que
 *   distingue una biblioteca de una colección.
 *
 * Todo por reglas locales sobre los datos del dispositivo: ni IA ni servidor.
 */

const SOURCE_LABEL: Record<string, string> = {
  video: 'Vídeo',
  youtube: 'YouTube',
  instagram: 'Instagram',
  texto: 'Texto',
};

function countBy<T>(items: T[], key: (t: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

const pct = (n: number) => Math.round(n * 100);

/** Barras horizontales: una medida (nº de fichas), identidad en la etiqueta. */
function Bars({ data }: { data: [string, number][] }) {
  const top = Math.max(...data.map(([, n]) => n), 1);
  return (
    <div className="bars">
      {data.map(([label, n]) => (
        <div className="bar-row" key={label}>
          <span className="bar-label">{label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(n / top) * 100}%` }} />
          </span>
          <span className="bar-value">{n}</span>
        </div>
      ))}
    </div>
  );
}

/** Columnas de actividad mensual. */
function Months({ meses, label }: { meses: [string, number][]; label: string }) {
  const top = Math.max(...meses.map(([, v]) => v), 1);
  return (
    <div className="col-chart" role="img" aria-label={`${label}. ${meses.map(([m, n]) => `${m}: ${n}`).join(', ')}`}>
      {meses.map(([mes, n]) => (
        <div className="col" key={mes}>
          <span className="col-value">{n > 0 ? n : ''}</span>
          <span className="col-fill" style={{ height: `${Math.max((n / top) * 100, n > 0 ? 6 : 0)}%` }} />
          <span className="col-label">{mes}</span>
        </div>
      ))}
    </div>
  );
}

export function Insights({
  cards,
  steps,
  onOpenCard,
  onPractice,
}: {
  cards: KnowledgeCard[];
  steps: StepRecord[];
  onOpenCard: (id: string) => void;
  onPractice: () => void;
}) {
  const [vista, setVista] = useState<'aplicado' | 'guardado'>('aplicado');

  if (cards.length === 0) {
    return (
      <div className="empty-state">
        <h2>Aún no hay nada que analizar</h2>
        <p>
          Cuando añadas fichas, aquí verás qué tipo de conocimiento guardas y —lo que de verdad importa— cuánto de eso
          llegas a aplicar.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="view-title">Insights</h1>

      <div className="segmented" role="tablist" aria-label="Vista de Insights">
        <button role="tab" aria-selected={vista === 'aplicado'} className={vista === 'aplicado' ? 'on' : ''} onClick={() => setVista('aplicado')}>
          Aplicado
        </button>
        <button role="tab" aria-selected={vista === 'guardado'} className={vista === 'guardado' ? 'on' : ''} onClick={() => setVista('guardado')}>
          Guardado
        </button>
      </div>

      {vista === 'aplicado' ? (
        <Aplicado cards={cards} steps={steps} onOpenCard={onOpenCard} onPractice={onPractice} />
      ) : (
        <Guardado cards={cards} />
      )}
    </div>
  );
}

/* ============================ APLICADO ============================ */

function Aplicado({
  cards,
  steps,
  onOpenCard,
  onPractice,
}: {
  cards: KnowledgeCard[];
  steps: StepRecord[];
  onOpenCard: (id: string) => void;
  onPractice: () => void;
}) {
  const stats = useMemo(() => appliedStats(cards, steps), [cards, steps]);
  const critica = useMemo(() => appliedCritique(stats), [stats]);

  if (stats.totalPasos === 0) {
    return (
      <div className="empty-state">
        <h2>Sin micropasos todavía</h2>
        <p>
          Tus fichas no traen acciones que registrar. Las que analices a partir de ahora vendrán con cinco micropasos
          cada una y esta pantalla te dirá cuántos aplicas.
        </p>
      </div>
    );
  }

  if (stats.hechos === 0) {
    return (
      <>
        <div className="lede">
          <p>
            Tienes <strong>{stats.totalPasos} micropasos</strong> esperando en {cards.length} fichas y no has dado
            ninguno. Por ahora esto es una colección, no una biblioteca.
          </p>
          <button className="btn primary" onClick={onPractice}>
            <IconDice size={18} /> Tirar el Dado
          </button>
        </div>
      </>
    );
  }

  // Solo las categorías con masa suficiente cuentan una historia; el resto es ruido.
  const conMasa = stats.porCategoria.filter((c) => c.generados >= 1);

  return (
    <>
      <div className="lede">
        <p>
          Has aplicado <strong>{stats.hechos}</strong> de {stats.totalPasos} micropasos: el{' '}
          <strong>{pct(stats.tasa)}%</strong>.
        </p>
        <div className="rate-bar" role="img" aria-label={`Tasa de aplicación ${pct(stats.tasa)}%`}>
          <span className="fill" style={{ width: `${Math.max(stats.tasa * 100, 1.5)}%` }} />
        </div>
      </div>

      <dl className="stat-row">
        <div>
          <dt>Racha</dt>
          <dd>{stats.racha === 0 ? '—' : `${stats.racha} d`}</dd>
        </div>
        <div>
          <dt>Hoy</dt>
          <dd>{stats.hoy}</dd>
        </div>
        <div>
          <dt>7 días</dt>
          <dd>{stats.semana}</dd>
        </div>
        <div>
          <dt>1.er paso</dt>
          <dd>{stats.latenciaMediaDias === null ? '—' : `${Math.round(stats.latenciaMediaDias)} d`}</dd>
        </div>
      </dl>

      <section className="section">
        <h2>Lo que guardas frente a lo que aplicas</h2>
        <p className="hint">
          Arriba, cuánto ocupa cada categoría en tu biblioteca. Abajo, cuánto de lo que aplicas sale de ella. Cuando las
          dos barras no coinciden, ahí hay contenido que consumes sin usar.
        </p>
        <div className="gap-list">
          {conMasa.map((c) => (
            <div className="gap-row" key={c.categoria}>
              <div className="gap-head">
                <span className="gap-cat">{c.categoria}</span>
                <span className={`gap-tasa ${c.tasa >= 0.4 ? 'good' : c.tasa < 0.15 ? 'weak' : ''}`}>
                  {pct(c.tasa)}%
                </span>
              </div>
              <div
                className="gap-bars"
                role="img"
                aria-label={`${c.categoria}: ${pct(c.cuotaGuardada)}% de lo guardado, ${pct(
                  c.cuotaAplicada
                )}% de lo aplicado, tasa ${pct(c.tasa)}%`}
              >
                <span className="gap-track saved">
                  <span style={{ width: `${c.cuotaGuardada * 100}%` }} />
                </span>
                <span className="gap-track applied">
                  <span style={{ width: `${c.cuotaAplicada * 100}%` }} />
                </span>
              </div>
              <div className="gap-foot">
                <span>
                  {c.fichas} ficha{c.fichas === 1 ? '' : 's'} · {c.hechos}/{c.generados} pasos
                </span>
                {c.descartados > 0 && (
                  <span>
                    {c.descartados} descartado{c.descartados === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Lectura crítica</h2>
        <ul className="critique-list">
          {critica.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2>Micropasos aplicados por mes</h2>
        <Months meses={stats.meses} label="Micropasos aplicados por mes" />
      </section>

      {stats.topFichas.length > 0 && (
        <section className="section">
          <h2>Lo que más te ha servido</h2>
          <p className="hint">Fichas con más pasos aplicados: el conocimiento que salió del papel.</p>
          <ul className="card-list">
            {stats.topFichas.map(({ card, hechos, total }) => (
              <li key={card.id}>
                <button className="row-link" onClick={() => onOpenCard(card.id)}>
                  <span className="row-icon"><SourceIcon tipo={card.fuente.tipo} /></span>
                  <span className="row-main">
                    <span className="row-title">{card.titulo}</span>
                    <span className="row-sub">{card.categoria}</span>
                  </span>
                  <span className="row-value">{hechos}/{total}</span>
                  <IconChevron size={16} className="row-chevron" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats.zombis.length > 0 && (
        <section className="section">
          <h2>Fichas zombi</h2>
          <p className="hint">
            Guardadas hace más de un mes sin un solo paso dado. Aplícalas o bórralas: el ruido también cuesta atención.
          </p>
          <ul className="card-list">
            {stats.zombis.slice(0, 6).map((card) => (
              <li key={card.id}>
                <button className="row-link" onClick={() => onOpenCard(card.id)}>
                  <span className="row-icon"><SourceIcon tipo={card.fuente.tipo} /></span>
                  <span className="row-main">
                    <span className="row-title">{card.titulo}</span>
                    <span className="row-sub">
                      {Math.round((Date.now() - card.createdAt) / 86_400_000)} días sin estrenar
                    </span>
                  </span>
                  <IconChevron size={16} className="row-chevron" />
                </button>
              </li>
            ))}
          </ul>
          {stats.zombis.length > 6 && <p className="hint">…y {stats.zombis.length - 6} más.</p>}
        </section>
      )}

      <button className="btn primary wide" onClick={onPractice}>
        <IconDice size={18} /> Aplicar un micropaso ahora
      </button>
    </>
  );
}

/* ============================ GUARDADO ============================ */

function Guardado({ cards }: { cards: KnowledgeCard[] }) {
  const shares = listShares();

  const stats = useMemo(() => {
    const total = cards.length;
    const minAhorrados = cards.reduce((s, c) => s + (c.evaluacion?.tiempoAhorradoMin ?? 0), 0);
    const utilidadMedia = cards.reduce((s, c) => s + (c.evaluacion?.utilidad ?? 0), 0) / total;
    const porCategoria = countBy(cards, (c) => c.categoria || 'Sin categoría');
    const porFuente = countBy(cards, (c) => SOURCE_LABEL[c.fuente.tipo] ?? c.fuente.tipo);
    const porNivel = countBy(cards, (c) => c.nivel);
    const fiab = { alta: 0, media: 0, baja: 0 };
    for (const c of cards) fiab[c.evaluacion?.fiabilidad ?? 'media']++;
    const etiquetas = countBy(cards.flatMap((c) => c.etiquetas ?? []), (t) => t).slice(0, 12);
    const porVerificar = cards.filter((c) => c.evaluacion?.necesitaVerificacion).length;
    const sinValor = cards.filter((c) => c.evaluacion && !c.evaluacion.mereceGuardarse).length;

    const meses: [string, number][] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const clave = `${d.getFullYear()}-${d.getMonth()}`;
      const n = cards.filter((c) => {
        const cd = new Date(c.createdAt);
        return `${cd.getFullYear()}-${cd.getMonth()}` === clave;
      }).length;
      meses.push([d.toLocaleDateString('es', { month: 'short' }), n]);
    }

    return { total, minAhorrados, utilidadMedia, porCategoria, porFuente, porNivel, fiab, etiquetas, porVerificar, sinValor, meses };
  }, [cards]);

  // Observaciones sobre los PATRONES de lo que entra en la biblioteca.
  const critica = useMemo(() => {
    const obs: string[] = [];
    const { total, porCategoria, fiab, porVerificar, sinValor, utilidadMedia } = stats;

    if (fiab.baja / total > 0.3) {
      obs.push(
        `El ${pct(fiab.baja / total)}% de lo que guardas es de fiabilidad baja (afirmaciones sin respaldo). Estás acumulando opiniones, no conocimiento: prioriza fuentes que citen evidencia.`
      );
    }
    if (porVerificar > 0) {
      obs.push(
        `${porVerificar} ficha${porVerificar > 1 ? 's contienen' : ' contiene'} afirmaciones marcadas como dudosas. No las apliques sin contrastar.`
      );
    }
    if (sinValor > 0) {
      obs.push(
        sinValor === 1
          ? 'Una ficha que el análisis marcó como "no merece guardarse" sigue aquí. Bórrala o justifica por qué la conservas.'
          : `${sinValor} fichas que el análisis marcó como "no merecen guardarse" siguen aquí. Bórralas o justifica por qué las conservas.`
      );
    }
    if (porCategoria.length > 0 && porCategoria[0][1] / total > 0.5 && total >= 6) {
      obs.push(
        `Más de la mitad de tu biblioteca es "${porCategoria[0][0]}". El monocultivo temático refuerza sesgos de confirmación: contrasta con fuentes que discrepen.`
      );
    }
    if (utilidadMedia < 6 && total >= 5) {
      obs.push(
        `La utilidad media de tus fichas es ${utilidadMedia.toFixed(1)}/10. Estás guardando contenido flojo: sé más selectivo con lo que analizas.`
      );
    }
    if (obs.length === 0) {
      obs.push('Fiabilidad razonable y sin acumulación de fichas dudosas. Lo que entra en la biblioteca está sano.');
    }
    return obs;
  }, [stats]);

  const compartidasPorCategoria = countBy(shares, (s) => s.categoria || 'Sin categoría').slice(0, 6);

  return (
    <>
      <dl className="stat-row">
        <div>
          <dt>Fichas</dt>
          <dd>{stats.total}</dd>
        </div>
        <div>
          <dt>Ahorrado</dt>
          <dd>{stats.minAhorrados}′</dd>
        </div>
        <div>
          <dt>Utilidad</dt>
          <dd>{stats.utilidadMedia.toFixed(1)}</dd>
        </div>
        <div>
          <dt>Exportadas</dt>
          <dd>{shares.length}</dd>
        </div>
      </dl>

      <section className="section">
        <h2>Lectura crítica</h2>
        <ul className="critique-list">
          {critica.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2>Por categoría</h2>
        <Bars data={stats.porCategoria} />
      </section>

      <section className="section">
        <h2>Por tipo de fuente</h2>
        <Bars data={stats.porFuente} />
      </section>

      <section className="section">
        <h2>Fichas añadidas por mes</h2>
        <Months meses={stats.meses} label="Fichas añadidas por mes" />
      </section>

      <section className="section">
        <h2>Fiabilidad y nivel</h2>
        <div className="bars">
          {(['alta', 'media', 'baja'] as const).map((f) => (
            <div className="bar-row" key={f}>
              <span className="bar-label">
                {f === 'baja' && <IconBolt size={13} className="inline-warn" />} {f}
              </span>
              <span className="bar-track">
                <span className={`bar-fill fiab-${f}`} style={{ width: `${(stats.fiab[f] / stats.total) * 100}%` }} />
              </span>
              <span className="bar-value">{stats.fiab[f]}</span>
            </div>
          ))}
        </div>
        <div style={{ height: 10 }} />
        <Bars data={stats.porNivel} />
      </section>

      {compartidasPorCategoria.length > 0 && (
        <section className="section">
          <h2>Lo que exportas o compartes</h2>
          <p className="hint">Copias, descargas y compartidos por categoría.</p>
          <Bars data={compartidasPorCategoria} />
        </section>
      )}

      <section className="section">
        <h2>Etiquetas más frecuentes</h2>
        <div className="chip-row">
          {stats.etiquetas.map(([t, n]) => (
            <span className="chip" key={t}>
              {t} · {n}
            </span>
          ))}
        </div>
      </section>
    </>
  );
}
