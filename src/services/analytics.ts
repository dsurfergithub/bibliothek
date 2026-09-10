import type { KnowledgeCard, StepRecord } from '../domain/types';

/**
 * Estadísticas de APLICACIÓN: no qué guardas, sino qué has llegado a hacer.
 *
 * Todo se deriva de los micropasos (`services/steps.ts`) cruzados con sus
 * fichas. Son funciones puras sobre los datos que ya tiene la app en memoria:
 * ni IA ni servidor, igual que el resto de Bibliotheke.
 */

const DIA = 86_400_000;
/** A partir de aquí, una ficha guardada y sin un solo paso dado es una ficha zombi. */
const DIAS_ZOMBI = 30;

/** Inicio del día local de una marca de tiempo (las rachas se cuentan por días, no por 24h). */
function dia(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface CategoriaAplicada {
  categoria: string;
  fichas: number;
  generados: number;
  hechos: number;
  descartados: number;
  /** Pasos hechos sobre pasos generados. El número que de verdad importa. */
  tasa: number;
  /** Qué parte de tu biblioteca es esta categoría (fichas). */
  cuotaGuardada: number;
  /** Qué parte de lo que APLICAS es esta categoría (pasos hechos). */
  cuotaAplicada: number;
}

export interface FichaAplicada {
  card: KnowledgeCard;
  hechos: number;
  total: number;
}

export interface AppliedStats {
  totalPasos: number;
  hechos: number;
  descartados: number;
  pendientes: number;
  /** Tasa global de aplicación (0-1). */
  tasa: number;
  hoy: number;
  semana: number;
  /** Días seguidos con al menos un micropaso aplicado (hoy o ayer mantienen viva la racha). */
  racha: number;
  mejorRacha: number;
  /** Días de media entre guardar una ficha y dar su primer paso. null si aún no hay ninguno. */
  latenciaMediaDias: number | null;
  porCategoria: CategoriaAplicada[];
  /** Fichas guardadas hace más de un mes sin un solo paso dado. */
  zombis: KnowledgeCard[];
  /** Lo que de verdad te ha servido: fichas con más pasos aplicados. */
  topFichas: FichaAplicada[];
  /** Pasos aplicados por mes, últimos 6, en orden cronológico. */
  meses: [string, number][];
}

export function appliedStats(cards: KnowledgeCard[], steps: StepRecord[], now = Date.now()): AppliedStats {
  const byCard = new Map(cards.map((c) => [c.id, c]));
  // Solo cuentan los pasos cuya ficha sigue existiendo.
  const vivos = steps.filter((s) => byCard.has(s.cardId));
  const hechosList = vivos.filter((s) => s.estado === 'hecho');
  const descartados = vivos.filter((s) => s.estado === 'descartado').length;
  const hechos = hechosList.length;

  const hoyIni = dia(now);
  const hoy = hechosList.filter((s) => dia(s.doneAt ?? 0) === hoyIni).length;
  const semana = hechosList.filter((s) => (s.doneAt ?? 0) >= now - 7 * DIA).length;

  /* --- racha: días naturales seguidos con al menos un paso --- */
  const diasConPaso = [...new Set(hechosList.map((s) => dia(s.doneAt ?? 0)))].sort((a, b) => b - a);
  let racha = 0;
  if (diasConPaso.length > 0 && (diasConPaso[0] === hoyIni || diasConPaso[0] === hoyIni - DIA)) {
    racha = 1;
    for (let i = 1; i < diasConPaso.length; i++) {
      if (diasConPaso[i - 1] - diasConPaso[i] !== DIA) break;
      racha++;
    }
  }
  let mejorRacha = 0;
  let corrida = 0;
  for (let i = 0; i < diasConPaso.length; i++) {
    corrida = i > 0 && diasConPaso[i - 1] - diasConPaso[i] === DIA ? corrida + 1 : 1;
    mejorRacha = Math.max(mejorRacha, corrida);
  }

  /* --- latencia: de guardar la ficha a dar su primer paso --- */
  const primeros = new Map<string, number>();
  for (const s of hechosList) {
    const t = s.doneAt ?? 0;
    const previo = primeros.get(s.cardId);
    if (previo === undefined || t < previo) primeros.set(s.cardId, t);
  }
  const latencias = [...primeros.entries()]
    .map(([cardId, t]) => (t - (byCard.get(cardId)?.createdAt ?? t)) / DIA)
    .filter((d) => d >= 0);
  const latenciaMediaDias = latencias.length
    ? latencias.reduce((a, b) => a + b, 0) / latencias.length
    : null;

  /* --- por categoría: guardado frente a aplicado --- */
  const cats = new Map<string, CategoriaAplicada>();
  const cat = (c: KnowledgeCard) => c.categoria || 'Sin categoría';
  for (const c of cards) {
    const k = cat(c);
    const acc =
      cats.get(k) ??
      { categoria: k, fichas: 0, generados: 0, hechos: 0, descartados: 0, tasa: 0, cuotaGuardada: 0, cuotaAplicada: 0 };
    acc.fichas++;
    cats.set(k, acc);
  }
  for (const s of vivos) {
    const c = byCard.get(s.cardId)!;
    const acc = cats.get(cat(c))!;
    acc.generados++;
    if (s.estado === 'hecho') acc.hechos++;
    if (s.estado === 'descartado') acc.descartados++;
  }
  const porCategoria = [...cats.values()]
    .map((a) => ({
      ...a,
      tasa: a.generados ? a.hechos / a.generados : 0,
      cuotaGuardada: cards.length ? a.fichas / cards.length : 0,
      cuotaAplicada: hechos ? a.hechos / hechos : 0,
    }))
    .sort((a, b) => b.fichas - a.fichas);

  /* --- zombis y top --- */
  const hechosPorFicha = new Map<string, number>();
  const totalPorFicha = new Map<string, number>();
  for (const s of vivos) {
    totalPorFicha.set(s.cardId, (totalPorFicha.get(s.cardId) ?? 0) + 1);
    if (s.estado === 'hecho') hechosPorFicha.set(s.cardId, (hechosPorFicha.get(s.cardId) ?? 0) + 1);
  }
  const zombis = cards
    .filter((c) => now - c.createdAt > DIAS_ZOMBI * DIA && !hechosPorFicha.get(c.id))
    .sort((a, b) => a.createdAt - b.createdAt);
  const topFichas: FichaAplicada[] = [...hechosPorFicha.entries()]
    .map(([id, n]) => ({ card: byCard.get(id)!, hechos: n, total: totalPorFicha.get(id) ?? n }))
    .sort((a, b) => b.hechos - a.hechos || b.total - a.total)
    .slice(0, 5);

  /* --- actividad de aplicación, 6 meses --- */
  const meses: [string, number][] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const clave = `${d.getFullYear()}-${d.getMonth()}`;
    const n = hechosList.filter((s) => {
      const sd = new Date(s.doneAt ?? 0);
      return `${sd.getFullYear()}-${sd.getMonth()}` === clave;
    }).length;
    meses.push([d.toLocaleDateString('es', { month: 'short' }), n]);
  }

  return {
    totalPasos: vivos.length,
    hechos,
    descartados,
    pendientes: vivos.length - hechos - descartados,
    tasa: vivos.length ? hechos / vivos.length : 0,
    hoy,
    semana,
    racha,
    mejorRacha,
    latenciaMediaDias,
    porCategoria,
    zombis,
    topFichas,
    meses,
  };
}

/**
 * Lectura crítica de lo APLICADO. Reglas locales, sin IA, y deliberadamente
 * incómodas: el objetivo es que la app te diga lo que una biblioteca bonita
 * nunca te dice.
 */
export function appliedCritique(stats: AppliedStats): string[] {
  const obs: string[] = [];
  const pct = (n: number) => Math.round(n * 100);

  if (stats.totalPasos === 0) return obs;

  if (stats.hechos === 0) {
    obs.push(
      `Has generado ${stats.totalPasos} micropasos y no has dado ninguno. Toda tu biblioteca es, por ahora, entretenimiento bien archivado: tira el Dado y haz uno.`
    );
    return obs;
  }

  // El hueco entre lo que ocupa tu biblioteca y lo que de verdad aplicas.
  const grandes = stats.porCategoria.filter((c) => c.fichas >= 2 && c.generados >= 3);
  const hueco = grandes
    .map((c) => ({ c, gap: c.cuotaGuardada - c.cuotaAplicada }))
    .sort((a, b) => b.gap - a.gap)[0];
  if (hueco && hueco.gap > 0.15) {
    obs.push(
      `"${hueco.c.categoria}" es el ${pct(hueco.c.cuotaGuardada)}% de tu biblioteca pero solo el ${pct(hueco.c.cuotaAplicada)}% de lo que aplicas (tasa ${pct(hueco.c.tasa)}%). Ahí consumes contenido, no lo usas: o lo aplicas o deja de guardarlo.`
    );
  }

  const mejor = [...grandes].sort((a, b) => b.tasa - a.tasa)[0];
  if (mejor && mejor.tasa >= 0.4 && mejor.categoria !== hueco?.c.categoria) {
    obs.push(
      `Donde sí conviertes es "${mejor.categoria}": aplicas el ${pct(mejor.tasa)}% de sus pasos. Cuando dudes de qué guardar, guarda más de esto.`
    );
  }

  if (stats.tasa < 0.2 && stats.totalPasos >= 20) {
    obs.push(
      `Aplicas el ${pct(stats.tasa)}% de los micropasos que generas. La app no tiene un problema de análisis, lo tienes de ejecución: baja el listón y usa el filtro de pasos fáciles.`
    );
  }

  if (stats.zombis.length > 0) {
    const n = stats.zombis.length;
    obs.push(
      `${n} ficha${n > 1 ? 's llevan' : ' lleva'} más de un mes guardada${n > 1 ? 's' : ''} sin un solo paso dado. La más vieja: "${stats.zombis[0].titulo}". Aplícalas o bórralas, no hay tercera opción honesta.`
    );
  }

  if (stats.latenciaMediaDias !== null && stats.latenciaMediaDias > 7) {
    obs.push(
      `Tardas ${Math.round(stats.latenciaMediaDias)} días de media desde que guardas una ficha hasta que das su primer paso. Cuanto más tarde, menos contexto conservas: intenta dar un paso el mismo día.`
    );
  }

  if (stats.descartados >= 5 && stats.descartados > stats.hechos) {
    obs.push(
      `Has marcado ${stats.descartados} pasos como "no aplica", más de los que has hecho. O el contenido que analizas no encaja con tu vida real, o estás usando ese botón para huir.`
    );
  }

  if (stats.racha >= 3) {
    obs.push(`Llevas ${stats.racha} días seguidos aplicando algo. Es la métrica que más se parece a aprender de verdad.`);
  } else if (stats.mejorRacha >= 3 && stats.racha === 0) {
    obs.push(`Tu mejor racha fueron ${stats.mejorRacha} días seguidos y ahora estás a cero. Un paso fácil hoy la reabre.`);
  }

  if (obs.length === 0) {
    obs.push(
      `Has aplicado ${stats.hechos} de ${stats.totalPasos} micropasos (${pct(stats.tasa)}%) repartidos por tu biblioteca. Ritmo sano: sigue tirando el Dado.`
    );
  }
  return obs.slice(0, 5);
}

/** Fichas sin ningún paso registrado (guardadas antes de la capa de práctica y sin acciones). */
export function sinPasos(cards: KnowledgeCard[], steps: StepRecord[]): number {
  const conPasos = new Set(steps.map((s) => s.cardId));
  return cards.filter((c) => !conPasos.has(c.id)).length;
}
