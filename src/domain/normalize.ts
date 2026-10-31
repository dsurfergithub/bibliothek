import type {
  Evaluacion,
  Fiabilidad,
  KnowledgeCard,
  LinkEstado,
  LinkRecord,
  Nivel,
  SourceKind,
  StepRecord,
  StepState,
  Tombstone,
} from './types';
import { linkId } from './types';

/**
 * Validación y adaptación de todo lo que entra de fuera: copias de seguridad,
 * enlaces de otro dispositivo y, por si acaso, lo que ya hay en IndexedDB.
 *
 * Antes bastaba con `id` y `titulo` para guardar una ficha, y una copia
 * recortada a mano (o de una versión antigua) entraba sin listas, sin `fuente`
 * o sin `evaluacion`, y la app fallaba después al pintarla. Ahora cada campo se
 * comprueba y, si falta o tiene otro tipo, se rellena con un valor neutro. Lo
 * que no se puede rescatar (sin id o sin título) se descarta y se cuenta.
 */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const score = (v: unknown): number => {
  const n = num(v);
  return n === undefined ? 5 : Math.min(10, Math.max(1, Math.round(n)));
};

const NIVELES: readonly Nivel[] = ['básico', 'intermedio', 'avanzado'];
const FIABILIDADES: readonly Fiabilidad[] = ['alta', 'media', 'baja'];
const FUENTES: readonly SourceKind[] = ['video', 'youtube', 'instagram', 'texto'];
const ESTADOS: readonly StepState[] = ['pendiente', 'hecho', 'descartado', 'aplazado'];
const LINK_ESTADOS: readonly LinkEstado[] = ['manual', 'confirmada', 'descartada'];

const LIST_KEYS = [
  'aprendizajes',
  'consejos',
  'acciones',
  'checklist',
  'herramientas',
  'apps',
  'webs',
  'libros',
  'personas',
  'empresas',
  'prompts',
  'frameworks',
  'metodos',
  'conceptos',
  'erroresComunes',
  'fuentesDetectadas',
  'textoEnPantalla',
  'etiquetas',
] as const;

function evaluacion(v: unknown): Evaluacion {
  const e = isObj(v) ? v : {};
  return {
    utilidad: score(e.utilidad),
    accionable: score(e.accionable),
    originalidad: score(e.originalidad),
    claridad: score(e.claridad),
    fiabilidad: oneOf(e.fiabilidad, FIABILIDADES, 'media'),
    mereceGuardarse: typeof e.mereceGuardarse === 'boolean' ? e.mereceGuardarse : true,
    tiempoAhorradoMin: Math.max(0, Math.round(num(e.tiempoAhorradoMin) ?? 0)),
    necesitaVerificacion: e.necesitaVerificacion === true,
    afirmacionesDudosas: strList(e.afirmacionesDudosas),
  };
}

/** Ficha completa y bien formada, o null si no tiene ni id ni título con los que identificarla. */
export function normalizeCard(raw: unknown): KnowledgeCard | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id).trim();
  const titulo = str(raw.titulo).trim();
  if (!id || !titulo) return null;

  const fuente = isObj(raw.fuente) ? raw.fuente : {};
  const createdAt = num(raw.createdAt) ?? num(raw.updatedAt) ?? Date.now();
  const lists = Object.fromEntries(LIST_KEYS.map((k) => [k, strList(raw[k])])) as Record<
    (typeof LIST_KEYS)[number],
    string[]
  >;

  const card: KnowledgeCard = {
    ...lists,
    id,
    titulo,
    resumenCorto: str(raw.resumenCorto),
    resumenDetallado: str(raw.resumenDetallado),
    ideaPrincipal: str(raw.ideaPrincipal),
    analisisCritico: str(raw.analisisCritico),
    categoria: str(raw.categoria).trim(),
    nivel: oneOf(raw.nivel, NIVELES, 'básico'),
    idioma: str(raw.idioma, 'es'),
    tiempoLecturaMin: Math.max(1, Math.round(num(raw.tiempoLecturaMin) ?? 1)),
    evaluacion: evaluacion(raw.evaluacion),
    createdAt,
    fuente: { tipo: oneOf(fuente.tipo, FUENTES, 'texto'), referencia: str(fuente.referencia) },
    notas: str(raw.notas),
  };
  const updatedAt = num(raw.updatedAt);
  if (updatedAt !== undefined) card.updatedAt = updatedAt;
  const vistoAt = num(raw.vistoAt);
  if (vistoAt !== undefined) card.vistoAt = vistoAt;
  return card;
}

export function normalizeStep(raw: unknown): StepRecord | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const cardId = str(raw.cardId);
  const indice = num(raw.indice);
  const texto = str(raw.texto).trim();
  if (!id || !cardId || indice === undefined || indice < 0 || !texto) return null;
  const now = Date.now();
  const step: StepRecord = {
    id,
    cardId,
    indice: Math.floor(indice),
    texto,
    estado: oneOf(raw.estado, ESTADOS, 'pendiente'),
    createdAt: num(raw.createdAt) ?? now,
    updatedAt: num(raw.updatedAt) ?? 0,
    ofrecido: Math.max(0, Math.floor(num(raw.ofrecido) ?? 0)),
  };
  const checklist = str(raw.checklist).trim();
  if (checklist) step.checklist = checklist;
  const doneAt = num(raw.doneAt);
  if (doneAt !== undefined) step.doneAt = doneAt;
  const snoozeUntil = num(raw.snoozeUntil);
  if (snoozeUntil !== undefined) step.snoozeUntil = snoozeUntil;
  return step;
}

export function normalizeTombstone(raw: unknown): Tombstone | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const deletedAt = num(raw.deletedAt);
  return id && deletedAt !== undefined ? { id, deletedAt } : null;
}

export function normalizeLink(raw: unknown): LinkRecord | null {
  if (!isObj(raw)) return null;
  const a = str(raw.a);
  const b = str(raw.b);
  if (!a || !b || a === b) return null;
  return {
    id: linkId(a, b),
    a: a < b ? a : b,
    b: a < b ? b : a,
    estado: oneOf(raw.estado, LINK_ESTADOS, 'manual'),
    nota: str(raw.nota),
    updatedAt: num(raw.updatedAt) ?? 0,
  };
}

/** Normaliza una lista y cuenta cuántos elementos no se pudieron rescatar. */
export function normalizeAll<T>(raw: unknown, fn: (x: unknown) => T | null): { ok: T[]; invalid: number } {
  if (!Array.isArray(raw)) return { ok: [], invalid: 0 };
  const ok: T[] = [];
  let invalid = 0;
  for (const x of raw) {
    const v = fn(x);
    if (v) ok.push(v);
    else invalid++;
  }
  return { ok, invalid };
}
