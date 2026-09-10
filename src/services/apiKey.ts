/**
 * La API key vive SOLO en este dispositivo (localStorage) y solo viaja a la
 * API de Google. Nunca se envía a ningún servidor de Bibliotheke — no existe
 * tal servidor. Nota honesta: en un navegador no hay cifrado en reposo real
 * sin pedir una contraseña al usuario; se documenta en Ajustes.
 */
const KEY = 'bibliotheke.apiKey';
const MODEL_KEY = 'bibliotheke.model';

export const DEFAULT_MODEL = 'gemini-2.5-flash';
export const MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (rápido y económico)' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (máxima calidad)' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (mínimo coste)' },
];

export function getApiKey(): string | null {
  return localStorage.getItem(KEY);
}

export function setApiKey(key: string): void {
  localStorage.setItem(KEY, key.trim());
}

export function clearApiKey(): void {
  localStorage.removeItem(KEY);
}

export function getModel(): string {
  return localStorage.getItem(MODEL_KEY) ?? DEFAULT_MODEL;
}

export function setModel(model: string): void {
  localStorage.setItem(MODEL_KEY, model);
}

/**
 * Valida la clave con una petición mínima (listar modelos: no consume tokens).
 * Importa el SDK a demanda para no meterlo en el bundle de arranque.
 */
export async function validateApiKey(key: string): Promise<void> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: key.trim() });
  await ai.models.list();
}
