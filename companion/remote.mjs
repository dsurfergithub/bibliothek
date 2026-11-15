/** Extractor remoto de prueba. No recibe claves de Gemini ni cookies de Instagram. */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_BYTES = 50 * 1024 * 1024;
const TTL = 15 * 60 * 1000;
const failure = (status, message) => Object.assign(new Error(message), { status });

export function reelId(raw) {
  let url;
  try { url = new URL(raw); } catch { throw failure(400, 'Pega un enlace válido de Instagram.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !['instagram.com', 'www.instagram.com'].includes(url.hostname)
      || url.username || url.password || url.port) throw failure(400, 'Solo se admiten enlaces de Instagram.');
  const match = /^\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{4,24})\/?$/.exec(url.pathname);
  if (!match) throw failure(400, 'El enlace no corresponde a un reel o post de Instagram.');
  return match[1];
}

export function downloadReel(id, directory) {
  return new Promise((resolve, reject) => {
    // URL reconstruida: ni opciones de CLI, ni URLs arbitrarias, ni configuración del host.
    const child = spawn(process.env.YTDLP_BIN || 'yt-dlp', [
      '--ignore-config', '--no-playlist', '--no-progress', '--no-warnings',
      '--socket-timeout', '20', '--retries', '1', '--extractor-retries', '1',
      '--max-filesize', String(MAX_BYTES), '--match-filter', 'duration <=? 300',
      '-f', 'mp4', '-o', join(directory, 'video.%(ext)s'), '--write-info-json',
      '--', `https://www.instagram.com/reel/${id}/`,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    let timedOut = false;
    child.stderr.on('data', d => { error = (error + d).slice(-4096); });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 180000);
    child.on('error', () => { clearTimeout(timer); reject(failure(503, 'El extractor no está disponible.')); });
    child.on('close', async code => {
      clearTimeout(timer);
      if (timedOut) return reject(failure(504, 'Instagram tardó demasiado. Puedes subir el vídeo desde tu galería.'));
      if (code !== 0) {
        const message = /429|rate.limit/i.test(error)
          ? 'Instagram está limitando las descargas. Inténtalo más tarde o sube el vídeo desde tu galería.'
          : 'Instagram no permitió descargar este reel. Puede requerir sesión o no estar disponible. Sube el vídeo desde tu galería.';
        return reject(failure(502, message));
      }
      try {
        const info = JSON.parse(await readFile(join(directory, 'video.info.json'), 'utf8'));
        resolve({ caption: info.description || '', uploader: info.uploader || '', duration: info.duration ?? null });
      } catch { reject(failure(422, 'No se pudo obtener el vídeo (máximo 5 minutos y 50 MB).')); }
    });
  });
}

export function createExtractor({ token, origins, download = downloadReel, cacheMs = TTL } = {}) {
  if (!token || token.length < 24) throw new Error('EXTRACTOR_TOKEN debe tener al menos 24 caracteres.');
  if (!origins?.length || origins.includes('*')) throw new Error('Configura ALLOWED_ORIGINS con los orígenes exactos de tu app.');
  const cache = new Map();
  const inFlight = new Map();
  const secret = Buffer.from(`Bearer ${token}`);
  let active = 0;

  async function clean() {
    for (const [id, entry] of cache) {
      if (entry.expires <= Date.now()) {
        cache.delete(id);
        await rm(entry.directory, { recursive: true, force: true });
      }
    }
  }
  const timer = setInterval(() => void clean().catch(() => {}), 60000).unref();
  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) return json(res, 403, { error: 'Origen no permitido.' });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization' });
      return res.end();
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'Método no permitido.' });
    const url = new URL(req.url, 'http://extractor');
    // Readiness sin datos privados, compatible con los health checks del alojamiento.
    if (url.pathname === '/ready') return json(res, 200, { ok: true });
    const provided = Buffer.from(req.headers.authorization || '');
    if (provided.length !== secret.length || !timingSafeEqual(provided, secret)) {
      return json(res, 401, { error: 'Clave de acceso no válida.' });
    }
    try {
      if (url.pathname === '/health') return json(res, 200, { ok: true, mode: 'remote' });
      if (url.pathname === '/api/reel') {
        const id = reelId(url.searchParams.get('url') || '');
        await clean();
        if (!cache.has(id)) {
          if (!inFlight.has(id)) {
            if (active >= 2 || cache.size >= 20) throw failure(429, 'El servicio está ocupado. Vuelve a intentarlo en unos minutos.');
            active++;
            const job = (async () => {
              const directory = await mkdtemp(join(tmpdir(), 'bibliotheke-'));
              try {
                const meta = await download(id, directory);
                const file = join(directory, 'video.mp4');
                const size = (await stat(file)).size;
                if (!size || size > MAX_BYTES) throw failure(422, 'El vídeo supera el límite de 50 MB o está vacío.');
                cache.set(id, { directory, file, expires: Date.now() + cacheMs, meta: {
                  id, title: '', caption: String(meta.caption || ''), uploader: String(meta.uploader || ''),
                  duration: meta.duration ?? null, size, mimeType: 'video/mp4', videoUrl: `/api/video/${id}`,
                } });
              } catch (err) { await rm(directory, { recursive: true, force: true }); throw err; }
            })().finally(() => { active--; inFlight.delete(id); });
            inFlight.set(id, job);
          }
          await inFlight.get(id);
        }
        return json(res, 200, cache.get(id).meta);
      }
      const video = /^\/api\/video\/([A-Za-z0-9_-]{4,24})$/.exec(url.pathname);
      if (video) {
        const entry = cache.get(video[1]);
        if (!entry || entry.expires <= Date.now()) throw failure(404, 'El vídeo ha caducado. Vuelve a analizar el enlace.');
        // Mantener el archivo mientras se transmite, aunque caduque la caché.
        const stream = createReadStream(entry.file);
        stream.on('error', () => { if (!res.headersSent) json(res, 404, { error: 'Vídeo no disponible.' }); else res.destroy(); });
        stream.on('open', () => {
          res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': entry.meta.size });
          stream.pipe(res);
        });
        res.on('close', () => stream.destroy());
        return;
      }
      return json(res, 404, { error: 'Ruta no encontrada.' });
    } catch (err) {
      return json(res, err.status || 500, { error: err.status ? err.message : 'No se pudo descargar el vídeo. Prueba a subirlo desde tu galería.' });
    }
  });
  server.on('close', () => {
    clearInterval(timer);
    for (const { directory } of cache.values()) void rm(directory, { recursive: true, force: true });
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // El volumen temporal es efímero; limpiar restos de un reinicio del proceso.
  for (const name of await readdir(tmpdir())) {
    if (name.startsWith('bibliotheke-')) await rm(join(tmpdir(), name), { recursive: true, force: true });
  }
  const server = createExtractor({
    token: process.env.EXTRACTOR_TOKEN,
    origins: (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  });
  server.listen(Number(process.env.PORT || 8787), '0.0.0.0', () => console.log('Extractor remoto listo.'));
}
