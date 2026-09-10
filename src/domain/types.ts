/**
 * Modelo de dominio de Bibliotheke.
 *
 * Una `KnowledgeCard` es la ficha de conocimiento estructurado que produce
 * el análisis de una fuente (vídeo, YouTube, texto…). La parte generada por
 * Gemini es `CardAnalysis`; la app le añade identidad, fecha y fuente.
 */

export type SourceKind = 'video' | 'youtube' | 'instagram' | 'texto';

export type Nivel = 'básico' | 'intermedio' | 'avanzado';

export type Fiabilidad = 'alta' | 'media' | 'baja';

export interface SourceRef {
  tipo: SourceKind;
  /** URL (YouTube), nombre de archivo (vídeo) o primeras palabras (texto). */
  referencia: string;
}

export interface Evaluacion {
  /** 1–10: ¿cuánto valor práctico aporta? */
  utilidad: number;
  /** 1–10: ¿se puede aplicar de inmediato? */
  accionable: number;
  /** 1–10: ¿es novedoso o muy conocido? */
  originalidad: number;
  /** 1–10: ¿está bien explicado? */
  claridad: number;
  fiabilidad: Fiabilidad;
  /** ¿Recomendaría guardar esta ficha? */
  mereceGuardarse: boolean;
  /** Minutos que ahorra leer la ficha frente a volver a ver el contenido. */
  tiempoAhorradoMin: number;
  necesitaVerificacion: boolean;
  afirmacionesDudosas: string[];
}

/** Parte de la ficha generada por Gemini. */
export interface CardAnalysis {
  titulo: string;
  resumenCorto: string;
  resumenDetallado: string;
  ideaPrincipal: string;
  aprendizajes: string[];
  consejos: string[];
  acciones: string[];
  checklist: string[];
  herramientas: string[];
  apps: string[];
  webs: string[];
  libros: string[];
  personas: string[];
  empresas: string[];
  prompts: string[];
  frameworks: string[];
  metodos: string[];
  conceptos: string[];
  erroresComunes: string[];
  /** Argumentación crítica del conocimiento: respaldo, debilidades, contextos donde (no) aplica. */
  analisisCritico: string;
  fuentesDetectadas: string[];
  textoEnPantalla: string[];
  categoria: string;
  etiquetas: string[];
  nivel: Nivel;
  idioma: string;
  tiempoLecturaMin: number;
  evaluacion: Evaluacion;
}

/** Ficha completa tal y como se guarda en la biblioteca local. */
export interface KnowledgeCard extends CardAnalysis {
  id: string;
  createdAt: number;
  /**
   * Última modificación (ms epoch). Se usa para fundir cambios entre
   * dispositivos con "gana el más reciente". Las fichas antiguas sin este
   * campo caen a `createdAt`.
   */
  updatedAt?: number;
  fuente: SourceRef;
  /** Notas personales del usuario, editables. */
  notas: string;
}

/**
 * Un micropaso de una ficha, con su estado de aplicación. Es lo que convierte
 * la biblioteca en práctica: la ficha dice qué hacer, el `StepRecord` guarda si
 * llegaste a hacerlo.
 *
 * El `id` es determinista (`cardId#indice`) a propósito: así el mismo paso en el
 * móvil y en el PC es el MISMO registro y el traspaso funde sin duplicar.
 */
export type StepState = 'pendiente' | 'hecho' | 'descartado' | 'aplazado';

export interface StepRecord {
  /** `${cardId}#${indice}`. */
  id: string;
  cardId: string;
  /** Posición en `acciones` (0-4). Como el análisis los ordena de fácil a difícil, el índice ES la dificultad. */
  indice: number;
  /** El micropaso, copiado de la ficha. */
  texto: string;
  /** La versión marcable con criterio de "hecho" (`checklist[indice]`), si la ficha la trae. */
  checklist?: string;
  estado: StepState;
  createdAt: number;
  updatedAt: number;
  /** Cuándo se marcó como hecho. */
  doneAt?: number;
  /** Mientras esté en el futuro, el Dado no lo ofrece (estado "aplazado"). */
  snoozeUntil?: number;
  /** Veces que el Dado lo ha sacado: evita que salga siempre lo mismo. */
  ofrecido: number;
}

/** Claves de la ficha que ya no se pintan como lista suelta: tienen su propio bloque de práctica. */
export const PRACTICE_KEYS: ReadonlyArray<keyof CardAnalysis> = ['acciones', 'checklist'];

/** Secciones de lista de la ficha, para renderizado y exportación genéricos. */
export const LIST_SECTIONS: ReadonlyArray<{ key: keyof CardAnalysis; label: string }> = [
  { key: 'aprendizajes', label: 'Aprendizajes' },
  { key: 'consejos', label: 'Consejos' },
  { key: 'acciones', label: 'Acciones recomendadas' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'herramientas', label: 'Herramientas' },
  { key: 'apps', label: 'Apps' },
  { key: 'webs', label: 'Páginas web' },
  { key: 'libros', label: 'Libros' },
  { key: 'personas', label: 'Personas' },
  { key: 'empresas', label: 'Empresas' },
  { key: 'prompts', label: 'Prompts' },
  { key: 'frameworks', label: 'Frameworks' },
  { key: 'metodos', label: 'Métodos y técnicas' },
  { key: 'conceptos', label: 'Conceptos' },
  { key: 'erroresComunes', label: 'Errores comunes' },
  { key: 'fuentesDetectadas', label: 'Fuentes detectadas' },
  { key: 'textoEnPantalla', label: 'Texto en pantalla' },
];
