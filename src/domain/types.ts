/**
 * Modelo de dominio de Bibliotheke.
 *
 * Una `KnowledgeCard` es la ficha de conocimiento estructurado que produce
 * el análisis de una fuente (vídeo, YouTube, texto…). La parte generada por
 * Gemini es `CardAnalysis`; la app le añade identidad, fecha y fuente.
 */

export type SourceKind = 'video' | 'youtube' | 'texto';

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
  fuente: SourceRef;
  /** Notas personales del usuario, editables. */
  notas: string;
}

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
