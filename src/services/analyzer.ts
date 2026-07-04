import { GoogleGenAI, createPartFromUri, type Part } from '@google/genai';
import { ANALYST_PROMPT } from '../domain/prompt';
import { cardAnalysisSchema } from '../domain/schema';
import type { CardAnalysis, KnowledgeCard, SourceRef } from '../domain/types';

/**
 * Analizador de contenidos. Arquitectura de conectores: cada tipo de fuente
 * (`AnalysisInput`) se traduce a las `Part`s multimodales que entiende
 * Gemini; añadir una fuente nueva = añadir un caso aquí, sin tocar el resto.
 */
export type AnalysisInput =
  | { kind: 'video'; file: File }
  | { kind: 'youtube'; url: string }
  | { kind: 'texto'; text: string };

export type Stage = 'preparando' | 'subiendo' | 'procesando' | 'analizando' | 'guardando';

export const STAGE_LABELS: Record<Stage, string> = {
  preparando: 'Preparando el contenido',
  subiendo: 'Subiendo el vídeo a Gemini',
  procesando: 'Gemini está procesando el vídeo',
  analizando: 'Extrayendo conocimiento estructurado',
  guardando: 'Guardando la ficha en tu biblioteca',
};

/** Por debajo de este tamaño el vídeo viaja inline; por encima, vía Files API. */
const INLINE_LIMIT = 15 * 1024 * 1024;

export async function analyze(
  apiKey: string,
  model: string,
  input: AnalysisInput,
  onStage: (stage: Stage) => void
): Promise<KnowledgeCard> {
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
  return {
    ...analysis,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
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

    case 'video': {
      const { file } = input;
      const mimeType = file.type || 'video/mp4';
      const fuente: SourceRef = { tipo: 'video', referencia: file.name };

      if (file.size <= INLINE_LIMIT) {
        const data = await toBase64(file);
        return { parts: [{ inlineData: { data, mimeType } }], fuente };
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
      return { parts: [createPartFromUri(uploaded.uri, uploaded.mimeType ?? mimeType)], fuente };
    }
  }
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
