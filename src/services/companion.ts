/** El extractor descarga el vídeo; la clave de Gemini nunca se le envía. */
const CONFIG_KEY = 'bibliotheke.extractor';
export const COMPANION_URL = 'http://localhost:8787';
export interface ExtractorConfig { url: string; token: string }

export function getExtractorConfig(): ExtractorConfig {
  try {
    const value = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null');
    if (typeof value?.url === 'string' && typeof value?.token === 'string') return value;
  } catch { /* configuración dañada: usar compañero local */ }
  return { url: '', token: '' };
}

export function validateExtractorConfig(url: string, token: string): ExtractorConfig {
  if (!url.trim()) return { url: '', token: '' };
  const parsed = new URL(url.trim());
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('Usa la dirección HTTPS del servicio, sin rutas, parámetros ni credenciales.');
  }
  if (!token.trim()) throw new Error('Introduce la clave de acceso del servicio.');
  return { url: parsed.origin, token: token.trim() };
}

export function setExtractorConfig(url: string, token: string): void {
  const config = validateExtractorConfig(url, token);
  if (config.url) localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  else localStorage.removeItem(CONFIG_KEY);
}

export function remoteExtractor(): boolean { return !!getExtractorConfig().url; }
function connection(config = getExtractorConfig()) {
  return {
    base: config.url.replace(/\/$/, '') || COMPANION_URL,
    headers: config.url ? { Authorization: `Bearer ${config.token}` } : undefined,
  };
}

export async function checkExtractor(config = getExtractorConfig()): Promise<void> {
  const { base, headers } = connection(config);
  const res = await fetch(`${base}/health`, { headers, signal: AbortSignal.timeout(config.url ? 60000 : 1500), cache: 'no-store' });
  if (res.status === 401) throw new Error('La clave de acceso del servicio no es válida.');
  if (!res.ok || (await res.json()).ok !== true) throw new Error('El servicio de descarga no está disponible.');
}

export async function companionOnline(): Promise<boolean> {
  try { await checkExtractor(); return true; } catch { return false; }
}

interface ReelMeta { id: string; caption: string; uploader: string; mimeType: string; videoUrl: string }
export interface ReelDownload { file: File; caption: string; uploader: string }

export async function fetchReel(url: string): Promise<ReelDownload> {
  const { base, headers } = connection();
  let res: Response;
  try {
    res = await fetch(`${base}/api/reel?url=${encodeURIComponent(url)}`, {
      headers, signal: AbortSignal.timeout(200000), cache: 'no-store',
    });
  } catch {
    throw new Error(remoteExtractor()
      ? 'El servicio remoto no respondió a tiempo. Revisa su conexión en Ajustes o sube el vídeo desde tu galería.'
      : 'El compañero local no responde. Arráncalo o configura el servicio remoto en Ajustes.');
  }
  if (res.status === 401) throw new Error('La clave del servicio de descarga no es válida. Revísala en Ajustes.');
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `El servicio devolvió un error (${res.status}).`);
  }
  const meta = (await res.json()) as ReelMeta;
  // No reenviar la clave de acceso a una URL suministrada por el servidor.
  if (!/^[A-Za-z0-9_-]+$/.test(meta.id) || meta.videoUrl !== `/api/video/${meta.id}`) {
    throw new Error('El servicio devolvió una referencia de vídeo no válida.');
  }
  const videoRes = await fetch(`${base}${meta.videoUrl}`, { headers, signal: AbortSignal.timeout(120000), cache: 'no-store' });
  if (!videoRes.ok) throw new Error('No se pudo recuperar el vídeo. Intenta analizarlo de nuevo.');
  const file = new File([await videoRes.blob()], `${meta.id}.mp4`, { type: meta.mimeType || 'video/mp4' });
  return { file, caption: meta.caption, uploader: meta.uploader };
}
