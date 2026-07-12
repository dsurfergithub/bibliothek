import { useMemo } from 'react';
import type { KnowledgeCard } from '../domain/types';
import { listShares } from '../services/stats';

/**
 * Insights: radiografía de la biblioteca. Qué tipo de conocimiento se extrae
 * (categorías, fuentes, fechas, niveles, fiabilidad), qué se comparte, y una
 * lectura crítica automática de los patrones (reglas locales, sin IA).
 */

const SOURCE_LABEL: Record<string, string> = {
  video: '🎞️ Vídeo',
  youtube: '▶️ YouTube',
  instagram: '📸 Instagram',
  texto: '📄 Texto',
};

function countBy<T>(items: T[], key: (t: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** Barras horizontales: una medida (nº de fichas), identidad en la etiqueta. */
function Bars({ data, max }: { data: [string, number][]; max?: number }) {
  const top = max ?? Math.max(...data.map(([, n]) => n), 1);
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

export function Insights({ cards }: { cards: KnowledgeCard[] }) {
  const shares = listShares();

  const stats = useMemo(() => {
    if (cards.length === 0) return null;
    const total = cards.length;
    const minAhorrados = cards.reduce((s, c) => s + (c.evaluacion?.tiempoAhorradoMin ?? 0), 0);
    const utilidadMedia = cards.reduce((s, c) => s + (c.evaluacion?.utilidad ?? 0), 0) / total;
    const porCategoria = countBy(cards, (c) => c.categoria || 'Sin categoría');
    const porFuente = countBy(cards, (c) => SOURCE_LABEL[c.fuente.tipo] ?? c.fuente.tipo);
    const porNivel = countBy(cards, (c) => c.nivel);
    const fiab = { alta: 0, media: 0, baja: 0 };
    for (const c of cards) fiab[c.evaluacion?.fiabilidad ?? 'media']++;
    const etiquetas = countBy(
      cards.flatMap((c) => c.etiquetas.map((t) => ({ t }))),
      (x) => x.t
    ).slice(0, 12);
    const porVerificar = cards.filter((c) => c.evaluacion?.necesitaVerificacion).length;
    const sinValor = cards.filter((c) => c.evaluacion && !c.evaluacion.mereceGuardarse).length;

    // Últimos 6 meses, en orden cronológico.
    const meses: [string, number][] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = d.toLocaleDateString('es', { month: 'short' });
      const n = cards.filter((c) => {
        const cd = new Date(c.createdAt);
        return `${cd.getFullYear()}-${cd.getMonth()}` === key;
      }).length;
      meses.push([label, n]);
    }

    return { total, minAhorrados, utilidadMedia, porCategoria, porFuente, porNivel, fiab, etiquetas, porVerificar, sinValor, meses };
  }, [cards]);

  // Lectura crítica automática: observaciones sobre los PATRONES de la biblioteca.
  const critica = useMemo(() => {
    if (!stats) return [];
    const obs: string[] = [];
    const { total, porCategoria, fiab, porVerificar, sinValor, utilidadMedia } = stats;

    if (fiab.baja / total > 0.3) {
      obs.push(
        `El ${Math.round((fiab.baja / total) * 100)}% de lo que guardas es de fiabilidad BAJA (afirmaciones sin respaldo). Estás acumulando opiniones, no conocimiento: prioriza fuentes que citen evidencia.`
      );
    }
    if (porVerificar > 0) {
      obs.push(
        `${porVerificar} ficha${porVerificar > 1 ? 's contienen' : ' contiene'} afirmaciones marcadas como dudosas. No las apliques sin contrastarlas: ábrelas y revisa la sección ⚠️.`
      );
    }
    if (sinValor > 0) {
      obs.push(
        `${sinValor} ficha${sinValor > 1 ? 's' : ''} que el análisis marcó como "no merece guardarse" sigue${sinValor > 1 ? 'n' : ''} en tu biblioteca. Bórralas o justifica por qué las conservas: el ruido también cuesta atención.`
      );
    }
    if (porCategoria.length > 0 && porCategoria[0][1] / total > 0.5 && total >= 6) {
      obs.push(
        `Más de la mitad de tu biblioteca es "${porCategoria[0][0]}". El monocultivo temático refuerza sesgos de confirmación: contrasta con otras áreas o con fuentes que discrepen.`
      );
    }
    if (utilidadMedia < 6 && total >= 5) {
      obs.push(
        `La utilidad media de tus fichas es ${utilidadMedia.toFixed(1)}/10. Estás guardando contenido flojo: sé más selectivo con lo que analizas.`
      );
    }
    if (shares.length === 0 && total >= 5) {
      obs.push(
        `Has guardado ${total} fichas pero no has compartido ni exportado ninguna. El conocimiento que no se usa se olvida: revisa los 5 mini-pasos de tus mejores fichas y ejecuta uno hoy.`
      );
    }
    if (obs.length === 0) {
      obs.push('Biblioteca sana: fiabilidad razonable, sin acumulación de fichas dudosas y con uso real. Sigue así.');
    }
    return obs;
  }, [stats, shares.length]);

  if (!stats) {
    return (
      <div className="empty-state">
        <div className="big">📊</div>
        <h2>Aún no hay nada que analizar</h2>
        <p>Cuando añadas fichas, aquí verás qué tipo de conocimiento guardas, de dónde viene y qué patrones conviene vigilar.</p>
      </div>
    );
  }

  const compartidasPorCategoria = countBy(shares, (s) => s.categoria || 'Sin categoría').slice(0, 6);

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 14 }}>Insights</h1>

      <div className="eval-grid">
        <div className="eval-tile"><div className="label">Fichas</div><div className="value">{stats.total}</div></div>
        <div className="eval-tile"><div className="label">Tiempo ahorrado</div><div className="value plain">~{stats.minAhorrados} min</div></div>
        <div className="eval-tile"><div className="label">Utilidad media</div><div className="value">{stats.utilidadMedia.toFixed(1)}/10</div></div>
        <div className="eval-tile"><div className="label">Compartidas</div><div className="value">{shares.length}</div></div>
      </div>

      <div className="section">
        <h2>🧐 Lectura crítica de tu biblioteca</h2>
        <ul className="critique-list">
          {critica.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </div>

      <div className="section">
        <h2>Por categoría</h2>
        <Bars data={stats.porCategoria} />
      </div>

      <div className="section">
        <h2>Por tipo de fuente</h2>
        <Bars data={stats.porFuente} />
      </div>

      <div className="section">
        <h2>Actividad (últimos 6 meses)</h2>
        <div className="col-chart" role="img" aria-label={stats.meses.map(([m, n]) => `${m}: ${n}`).join(', ')}>
          {stats.meses.map(([label, n]) => {
            const top = Math.max(...stats.meses.map(([, v]) => v), 1);
            return (
              <div className="col" key={label}>
                <span className="col-value">{n > 0 ? n : ''}</span>
                <span className="col-fill" style={{ height: `${Math.max((n / top) * 100, n > 0 ? 6 : 0)}%` }} />
                <span className="col-label">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="section">
        <h2>Fiabilidad y nivel</h2>
        <div className="bars">
          {(['alta', 'media', 'baja'] as const).map((f) => (
            <div className="bar-row" key={f}>
              <span className="bar-label">{f === 'alta' ? '✅ alta' : f === 'media' ? '➖ media' : '⚠️ baja'}</span>
              <span className="bar-track">
                <span
                  className={`bar-fill fiab-${f}`}
                  style={{ width: `${(stats.fiab[f] / stats.total) * 100}%` }}
                />
              </span>
              <span className="bar-value">{stats.fiab[f]}</span>
            </div>
          ))}
        </div>
        <div style={{ height: 10 }} />
        <Bars data={stats.porNivel} />
      </div>

      {compartidasPorCategoria.length > 0 && (
        <div className="section">
          <h2>Lo que compartes o exportas</h2>
          <p className="hint" style={{ marginBottom: 8 }}>
            Copias, descargas y compartidos por categoría — lo que de verdad usas, no solo guardas.
          </p>
          <Bars data={compartidasPorCategoria} />
        </div>
      )}

      <div className="section">
        <h2>Etiquetas más frecuentes</h2>
        <div className="chip-row">
          {stats.etiquetas.map(([t, n]) => (
            <span className="chip" key={t}>#{t} · {n}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
