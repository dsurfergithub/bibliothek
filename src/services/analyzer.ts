import type { GoogleGenAI, Part } from '@google/genai';
import { ANALYST_PROMPT } from '../domain/prompt';
import { cardAnalysisSchema } from '../domain/schema';
import type { CardAnalysis, KnowledgeCard, SourceRef } from '../domain/types';
import { fetchReel } from './companion';

/**
 * Analizador de contenidos. Arquitectura de conectores: cada tipo de fuente
 * (`AnalysisInput`) se traduce a las `Part`s multimodales que entiende
 * Gemini; añadir una fuente nueva = añadir un caso aquí, sin tocar el resto.
 */
export type AnalysisInput =
  | { kind: 'video'; file: File }
  | { kind: 'youtube'; url: string }
  | { kind: 'instagram'; url: string }
  | { kind: 'texto'; text: string };

export type Stage = 'preparando' | 'descargando' | 'subiendo' | 'procesando' | 'analizando' | 'guardando';

export const STAGE_LABELS: Record<Stage, string> = {
  preparando: 'Preparando el contenido',
  descargando: 'Descargando el reel de Instagram',
  subiendo: 'Subiendo el vídeo a Gemini',
  procesando: 'Gemini está procesando el vídeo',
  analizando: 'Extrayendo conocimiento estructurado',
  guardando: 'Guardando la ficha en tu biblioteca',
};

/** Por debajo de este tamaño el vídeo viaja inline; por encima, vía Files API. */
const INLINE_LIMIT = 15 * 1024 * 1024;

/**
 * El SDK de Gemini pesa ~350 kB y solo hace falta al analizar, no al abrir la
 * app. Se carga a demanda; el navegador cachea el módulo tras la primera vez.
 */
const genai = () => import('@google/genai');

export async function analyze(
  apiKey: string,
  model: string,
  input: AnalysisInput,
  onStage: (stage: Stage) => void
): Promise<KnowledgeCard> {
  const { GoogleGenAI } = await genai();
  const ai = new GoogleGenAI({ apiKey });

  onStage('preparando');
  const { parts, fuente } = await buildParts(ai, input, onStage);

  onStage('analizando');
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [...parts, { text: ANALYST_PROMPT }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: cardAnalysisSchema,
      temperature: 0.2,
    },
  });

  const raw = response.text;
  if (!raw) throw new Error('Gemini no devolvió contenido. Inténtalo de nuevo.');
  const analysis = JSON.parse(raw) as CardAnalysis;

  onStage('guardando');
  const now = Date.now();
  return {
    ...analysis,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    fuente,
    notas: '',
  };
}

async function buildParts(
  ai: GoogleGenAI,
  input: AnalysisInput,
  onStage: (stage: Stage) => void
): Promise<{ parts: Part[]; fuente: SourceRef }> {
  switch (input.kind) {
    case 'youtube':
      // Gemini procesa URLs de YouTube de forma nativa: no hay que descargar nada.
      return {
        parts: [{ fileData: { fileUri: input.url.trim() } }],
        fuente: { tipo: 'youtube', referencia: input.url.trim() },
      };

    case 'texto':
      return {
        parts: [{ text: `CONTENIDO A ANALIZAR:\n\n${input.text}` }],
        fuente: { tipo: 'texto', referencia: input.text.slice(0, 80) },
      };

    case 'video':
      return {
        parts: await videoParts(ai, input.file, onStage),
        fuente: { tipo: 'video', referencia: input.file.name },
      };

    case 'instagram': {
      onStage('descargando');
      const { file, caption, uploader } = await fetchReel(input.url.trim());
      const parts = await videoParts(ai, file, onStage);
      // El caption suele llevar la mitad del valor (enlaces, listas, contexto):
      // se lo damos a Gemini junto al vídeo.
      if (caption.trim()) {
        parts.push({ text: `CAPTION DEL REEL${uploader ? ` (de @${uploader})` : ''}:\n\n${caption}` });
      }
      return { parts, fuente: { tipo: 'instagram', referencia: input.url.trim() } };
    }
  }
}

/** Convierte un archivo de vídeo en `Part`s: inline si es pequeño, Files API si no. */
async function videoParts(ai: GoogleGenAI, file: File, onStage: (stage: Stage) => void): Promise<Part[]> {
  const mimeType = file.type || 'video/mp4';

  if (file.size <= INLINE_LIMIT) {
    const data = await toBase64(file);
    return [{ inlineData: { data, mimeType } }];
  }

  onStage('subiendo');
  let uploaded = await ai.files.upload({ file, config: { mimeType } });

  onStage('procesando');
  while (uploaded.state === 'PROCESSING') {
    await sleep(2500);
    uploaded = await ai.files.get({ name: uploaded.name! });
  }
  if (uploaded.state === 'FAILED' || !uploaded.uri) {
    throw new Error('Gemini no pudo procesar el vídeo. Prueba con otro formato (MP4 recomendado).');
  }
  const { createPartFromUri } = await genai();
  return [createPartFromUri(uploaded.uri, uploaded.mimeType ?? mimeType)];
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Traduce errores de la API a mensajes accionables en español. */
export function humanizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED|401|403/i.test(msg)) {
    return 'La API key no es válida o no tiene permisos. Revísala en Ajustes.';
  }
  if (/RESOURCE_EXHAUSTED|429|quota/i.test(msg)) {
    return 'Has alcanzado el límite de tu cuota de Gemini. Espera unos minutos o revisa tu plan en Google AI Studio.';
  }
  if (/failed to fetch|network/i.test(msg)) {
    return 'Error de red. Comprueba tu conexión a internet.';
  }
  if (/INVALID_ARGUMENT.*youtube|not supported/i.test(msg)) {
    return 'Gemini no ha podido procesar esa URL. Comprueba que es un vídeo de YouTube público.';
  }
  return `Error durante el análisis: ${msg}`;
}
