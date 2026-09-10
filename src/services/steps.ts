import { db, STEP_STORE } from './db';
import type { KnowledgeCard, StepRecord, StepState } from '../domain/types';

/**
 * Registro de micropasos: la capa de PRÁCTICA de Bibliotheke.
 *
 * El análisis ya produce 5 micropasos por ficha, ordenados de fácil a difícil.
 * Hasta ahora eran texto muerto. Aquí cada uno pasa a ser un registro con
 * estado, así se puede saber qué conocimiento no solo guardaste, sino que
 * aplicaste — y el Dado puede elegir uno por ti con criterio.
 *
 * Los pasos se derivan de la ficha (`ensureSteps`), no se escriben a mano: si
 * añades una ficha en el móvil y la traspasas al PC, allí se crean solos.
 */

const DIA = 86_400_000;
/** "Ahora no" aparta el paso un par de días; no lo mata. */
const SNOOZE_DIAS = 2;

export const stepId = (cardId: string, indice: number) => `${cardId}#${indice}`;

/* ---------- lectura ---------- */

export async function listSteps(): Promise<StepRecord[]> {
  return (await db()).getAll(STEP_STORE);
}

export function stepsOf(steps: StepRecord[], cardId: string): StepRecord[] {
  return steps.filter((s) => s.cardId === cardId).sort((a, b) => a.indice - b.indice);
}

/** Progreso de una ficha: pasos hechos sobre pasos totales. */
export function progressOf(steps: StepRecord[], cardId: string): { hechos: number; total: number } {
  const mine = stepsOf(steps, cardId);
  return { hechos: mine.filter((s) => s.estado === 'hecho').length, total: mine.length };
}

/** Estado de aplicación de una ficha, para pintarla distinta en la biblioteca. */
export type CardPhase = 'nueva' | 'en-practica' | 'aplicada';

export function phaseOf(steps: StepRecord[], cardId: string): CardPhase {
  const { hechos, total } = progressOf(steps, cardId);
  if (total > 0 && hechos >= total) return 'aplicada';
  return hechos > 0 ? 'en-practica' : 'nueva';
}

export function doneToday(steps: StepRecord[], now = Date.now()): number {
  const desde = new Date(now);
  desde.setHours(0, 0, 0, 0);
  return steps.filter((s) => s.estado === 'hecho' && (s.doneAt ?? 0) >= desde.getTime()).length;
}

/* ---------- escritura ---------- */

/**
 * Crea los registros que falten para las fichas dadas. Idempotente: se puede
 * llamar en cada arranque. Sirve además de relleno para las fichas antiguas,
 * anteriores a que existiera esta capa.
 */
export async function ensureSteps(cards: KnowledgeCard[]): Promise<StepRecord[]> {
  const database = await db();
  const tx = database.transaction(STEP_STORE, 'readwrite');
  const now = Date.now();
  for (const card of cards) {
    const acciones = Array.isArray(card.acciones) ? card.acciones : [];
    for (let i = 0; i < acciones.length; i++) {
      const texto = (acciones[i] ?? '').trim();
      if (!texto) continue;
      const id = stepId(card.id, i);
      if (await tx.store.get(id)) continue;
      const paso: StepRecord = {
        id,
        cardId: card.id,
        indice: i,
        texto,
        checklist: card.checklist?.[i]?.trim() || undefined,
        estado: 'pendiente',
        createdAt: now,
        updatedAt: now,
        ofrecido: 0,
      };
      tx.store.put(paso);
    }
  }
  await tx.done;
  return listSteps();
}

/**
 * Cambia el estado de un paso. Relee el registro antes de escribir a propósito:
 * la copia que tiene la UI puede haberse quedado atrás (el Dado incrementa
 * `ofrecido` justo después de servirlo) y guardarla tal cual borraría ese dato.
 */
export async function setStepState(step: StepRecord, estado: StepState): Promise<void> {
  const database = await db();
  const actual = ((await database.get(STEP_STORE, step.id)) as StepRecord | undefined) ?? step;
  const now = Date.now();
  await database.put(STEP_STORE, {
    ...actual,
    estado,
    updatedAt: now,
    doneAt: estado === 'hecho' ? now : undefined,
    snoozeUntil: estado === 'aplazado' ? now + SNOOZE_DIAS * DIA : undefined,
  } satisfies StepRecord);
}

/** Anota que el Dado ha ofrecido este paso, para no repetirlo una y otra vez. */
export async function markOffered(step: StepRecord): Promise<void> {
  const database = await db();
  const actual = ((await database.get(STEP_STORE, step.id)) as StepRecord | undefined) ?? step;
  await database.put(STEP_STORE, { ...actual, ofrecido: actual.ofrecido + 1, updatedAt: Date.now() });
}

/**
 * Funde pasos de otro dispositivo. Como el `id` es determinista, el mismo paso
 * es el mismo registro en los dos sitios: gana el más reciente y nunca se borra
 * nada. Devuelve cuántos entraron.
 */
export async function importSteps(steps: unknown): Promise<number> {
  if (!Array.isArray(steps)) return 0;
  const database = await db();
  const tx = database.transaction(STEP_STORE, 'readwrite');
  let n = 0;
  for (const raw of steps) {
    const paso = raw as StepRecord;
    if (!paso || typeof paso.id !== 'string' || typeof paso.cardId !== 'string') continue;
    const existing = (await tx.store.get(paso.id)) as StepRecord | undefined;
    if (!existing || (paso.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
      tx.store.put(paso);
      n++;
    }
  }
  await tx.done;
  return n;
}

/* ---------- el Dado ---------- */

export interface DiceFilter {
  /** Solo pasos de esta categoría (null = cualquiera). */
  categoria: string | null;
  /** Solo los dos primeros pasos de cada ficha, que son los más fáciles. */
  soloFaciles: boolean;
}

export interface StepPick {
  step: StepRecord;
  card: KnowledgeCard;
  /** Por qué te toca ESTE paso: el Dado es aleatorio, pero no es ciego. */
  razon: string;
}

/** Pasos que el Dado puede ofrecer ahora mismo. */
export function availableSteps(
  steps: StepRecord[],
  cards: KnowledgeCard[],
  filtro: DiceFilter,
  now = Date.now()
): StepRecord[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  return steps.filter((s) => {
    const card = byId.get(s.cardId);
    if (!card) return false;
    if (s.estado === 'hecho' || s.estado === 'descartado') return false;
    if (s.estado === 'aplazado' && (s.snoozeUntil ?? 0) > now) return false;
    if (filtro.categoria && card.categoria !== filtro.categoria) return false;
    if (filtro.soloFaciles && s.indice > 1) return false;
    return true;
  });
}

/**
 * Elige un micropaso al azar, pero ponderado. Pesa más lo que:
 * (a) viene de una ficha que valoraste alto, (b) lleva tiempo guardado sin
 * estrenar, (c) es de una categoría que apenas aplicas, (d) es fácil, y
 * (e) el Dado no te ha ofrecido ya varias veces sin que lo hicieras.
 */
export function pickStep(
  steps: StepRecord[],
  cards: KnowledgeCard[],
  filtro: DiceFilter,
  excluirId?: string,
  now = Date.now()
): StepPick | null {
  const byId = new Map(cards.map((c) => [c.id, c]));
  let candidatos = availableSteps(steps, cards, filtro, now);
  // "Otro" no debe devolver lo mismo… salvo que no quede nada más.
  if (excluirId && candidatos.length > 1) candidatos = candidatos.filter((s) => s.id !== excluirId);
  if (candidatos.length === 0) return null;

  const hechosPorCategoria = new Map<string, number>();
  for (const s of steps) {
    if (s.estado !== 'hecho') continue;
    const cat = byId.get(s.cardId)?.categoria;
    if (cat) hechosPorCategoria.set(cat, (hechosPorCategoria.get(cat) ?? 0) + 1);
  }

  const pesados = candidatos.map((step) => {
    const card = byId.get(step.cardId)!;
    const factores = weigh(step, card, hechosPorCategoria, now);
    return { step, card, factores };
  });

  const total = pesados.reduce((s, p) => s + p.factores.peso, 0);
  let dado = Math.random() * total;
  for (const p of pesados) {
    dado -= p.factores.peso;
    if (dado <= 0) {
      return { step: p.step, card: p.card, razon: razonar(p.factores, p.card, p.step, hechosPorCategoria) };
    }
  }
  const ultimo = pesados[pesados.length - 1];
  return { step: ultimo.step, card: ultimo.card, razon: razonar(ultimo.factores, ultimo.card, ultimo.step, hechosPorCategoria) };
}

interface Factores {
  peso: number;
  reposo: number;
  dias: number;
  utilidad: number;
}

function weigh(
  step: StepRecord,
  card: KnowledgeCard,
  hechosPorCategoria: Map<string, number>,
  now: number
): Factores {
  const utilidad = card.evaluacion?.utilidad ?? 5;
  const dias = Math.max(0, (now - card.createdAt) / DIA);

  const wUtil = 0.5 + utilidad / 10; //            0.6 – 1.5
  const reposo = 1 + Math.min(dias / 30, 2); //    1 – 3: lo guardado y sin estrenar sube
  const wCategoria = 1 / (1 + (hechosPorCategoria.get(card.categoria) ?? 0) * 0.4);
  const wFacil = 1.4 - step.indice * 0.15; //      1.4 – 0.8
  const wFatiga = 1 / (1 + step.ofrecido * 0.6); // lo ofrecido y no hecho pierde fuerza

  return { peso: wUtil * reposo * wCategoria * wFacil * wFatiga, reposo, dias, utilidad };
}

function razonar(f: Factores, card: KnowledgeCard, step: StepRecord, hechos: Map<string, number>): string {
  const dias = Math.round(f.dias);
  if (dias >= 30) return `Guardada hace ${dias} días y sin estrenar: aplícala o bórrala.`;
  if (f.utilidad >= 8) return `De tus fichas mejor valoradas (utilidad ${f.utilidad}/10).`;
  if (card.categoria && !hechos.get(card.categoria)) return `Todavía no has aplicado nada de "${card.categoria}".`;
  if (step.indice === 0) return 'Es el paso más fácil de la ficha: por aquí se empieza.';
  if (dias >= 7) return `Lleva ${dias} días esperando en tu biblioteca.`;
  return `Paso ${step.indice + 1} de 5 de esta ficha.`;
}
