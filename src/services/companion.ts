/**
 * Cliente del Bibliotheke Companion: el servidor local (companion/) que
 * descarga Reels de Instagram con yt-dlp. El navegador no puede descargar
 * de Instagram directamente (login + CORS), así que la app le delega esa
 * parte a un proceso corriendo en la máquina del usuario.
 */

export const COMPANION_URL = 'http://localhost:8787';

export interface ReelMeta {
  id: string;
  title: string;
  caption: string;
  uploader: string;
  duration: number | null;
  size: number;
  mimeType: string;
  videoUrl: string;
}

export interface ReelDownload {
  file: File;
  caption: string;
  uploader: string;
}

/** ¿Está el compañero en marcha? Responde rápido para no colgar la UI. */
export async function companionOnline(): Promise<boolean> {
  try {
    const res = await fetch(`${COMPANION_URL}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Pide al compañero que descargue el reel y lo devuelve como File. */
export async function fetchReel(url: string): Promise<ReelDownload> {
  let res: Response;
  try {
    res = await fetch(`${COMPANION_URL}/api/reel?url=${encodeURIComponent(url)}`);
  } catch {
    throw new Error(
      'El compañero local no responde. Arráncalo con doble clic en companion/start.cmd y vuelve a intentarlo.'
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `El compañero devolvió un error (${res.status}).`);
  }
  const meta = (await res.json()) as ReelMeta;

  const videoRes = await fetch(`${COMPANION_URL}${meta.videoUrl}`);
  if (!videoRes.ok) throw new Error('El compañero no pudo servir el vídeo descargado.');
  const blob = await videoRes.blob();
  const file = new File([blob], `${meta.id}.mp4`, { type: meta.mimeType || 'video/mp4' });
  return { file, caption: meta.caption, uploader: meta.uploader };
}
