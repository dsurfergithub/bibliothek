/**
 * Bibliotheke Companion — servidor local que descarga Reels de Instagram
 * para que la app web (bibliothek.vercel.app o localhost) los analice.
 *
 * Por qué existe: la app es 100% cliente y el navegador no puede descargar
 * de Instagram (login + CORS). Este proceso corre en TU máquina, con TU IP,
 * y envuelve yt-dlp, que es quien sabe extraer el vídeo.
 *
 * Uso:  node server.mjs   (o doble clic en start.cmd)
 * Requisitos: Node 18+, yt-dlp (`pip install yt-dlp`).
 * Cookies (solo si un reel pide login): exporta cookies.txt de tu navegador
 * a esta carpeta (extensión "Get cookies.txt LOCALLY") — se usa sola.
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const DOWNLOADS = join(HERE, 'downloads');
const COOKIES = join(HERE, 'cookies.txt');
const MAX_AGE_MS = 48 * 60 * 60 * 1000; // caché de descargas: 48 h
const YTDLP_TIMEOUT_MS = 3 * 60 * 1000;

/** Orígenes que pueden llamarnos: la app en local y en Vercel. */
const ORIGIN_OK = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$|^https:\/\/[a-z0-9-]+\.vercel\.app$/;

/** URL de reel/post de Instagram → shortcode, o null si no lo es. */
function shortcodeOf(url) {
  const m = /^https?:\/\/(www\.)?instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/.exec(url);
  return m ? m[2] : null;
}

// ---------------------------------------------------------------- yt-dlp ---

/** Localiza cómo invocar yt-dlp en esta máquina (binario o módulo Python). */
async function detectYtdlp() {
  const candidates = [
    ['yt-dlp', []],
    ['python', ['-m', 'yt_dlp']],
    ['py', ['-m', 'yt_dlp']],
  ];
  for (const [cmd, pre] of candidates) {
    try {
      const version = await run(cmd, [...pre, '--version'], 15000);
      return { cmd, pre, version: version.trim() };
    } catch {
      /* siguiente candidato */
    }
  }
  return null;
}

function run(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('yt-dlp tardó demasiado y se ha cancelado.'));
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(err || `yt-dlp terminó con código ${code}`));
    });
  });
}

/** Traduce los errores típicos de yt-dlp a mensajes accionables. */
function humanizeYtdlpError(msg) {
  if (/login required|rate.?limit|not available|requested content/i.test(msg)) {
    return 'Instagram pide login para este reel. Exporta cookies.txt de tu navegador a la carpeta companion/ y vuelve a intentarlo.';
  }
  if (/Unsupported URL/i.test(msg)) {
    return 'Esa URL no parece un reel o post de Instagram válido.';
  }
  if (/HTTP Error 429/i.test(msg)) {
    return 'Instagram está limitando las peticiones. Espera unos minutos antes de seguir.';
  }
  return `yt-dlp no pudo descargar el reel: ${msg.slice(0, 300)}`;
}

// ------------------------------------------------------------- descargas ---

/** Descargas en curso, para no lanzar yt-dlp dos veces por el mismo reel. */
const inFlight = new Map();

async function fetchReel(url) {
  const id = shortcodeOf(url);
  if (!id) throw Object.assign(new Error('URL de Instagram no válida.'), { status: 400 });

  const metaPath = join(DOWNLOADS, `${id}.meta.json`);
  const videoPath = join(DOWNLOADS, `${id}.mp4`);
  if (existsSync(metaPath) && existsSync(videoPath)) {
    return JSON.parse(await readFile(metaPath, 'utf8'));
  }

  if (inFlight.has(id)) return inFlight.get(id);
  const job = (async () => {
    const args = [
      ...ytdlp.pre,
      '-f', 'mp4/best',
      '--no-playlist',
      '--no-simulate',
      '-o', join(DOWNLOADS, '%(id)s.%(ext)s'),
      '--print', '%(.{id,title,description,uploader,duration,ext})j',
    ];
    if (existsSync(COOKIES)) args.push('--cookies', COOKIES);
    args.push(`https://www.instagram.com/reel/${id}/`);

    let printed;
    try {
      printed = await run(ytdlp.cmd, args, YTDLP_TIMEOUT_MS);
    } catch (e) {
      throw Object.assign(new Error(humanizeYtdlpError(e.message)), { status: 502 });
    }
    const info = JSON.parse(printed.trim().split('\n').pop());
    const file = join(DOWNLOADS, `${info.id}.${info.ext || 'mp4'}`);
    const meta = {
      id: info.id,
      title: info.title ?? '',
      caption: info.description ?? '',
      uploader: info.uploader ?? '',
      duration: info.duration ?? null,
      ext: info.ext || 'mp4',
      size: statSync(file).size,
      mimeType: 'video/mp4',
      videoUrl: `/api/video/${info.id}`,
    };
    await writeFile(join(DOWNLOADS, `${info.id}.meta.json`), JSON.stringify(meta, null, 2));
    return meta;
  })();
  inFlight.set(id, job);
  try {
    return await job;
  } finally {
    inFlight.delete(id);
  }
}

function cleanOldDownloads() {
  const now = Date.now();
  for (const name of readdirSync(DOWNLOADS)) {
    const p = join(DOWNLOADS, name);
    try {
      if (now - statSync(p).mtimeMs > MAX_AGE_MS) unlinkSync(p);
    } catch {
      /* en uso o ya borrado */
    }
  }
}

// -------------------------------------------------------------- servidor ---

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(data);
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && ORIGIN_OK.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, OPTIONS' });
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/health') {
      return sendJson(res, 200, { ok: true, ytdlp: ytdlp.version, cookies: existsSync(COOKIES) });
    }

    if (url.pathname === '/api/reel') {
      const target = url.searchParams.get('url') ?? '';
      console.log(`→ reel: ${target}`);
      const meta = await fetchReel(target);
      console.log(`✓ listo: ${meta.id} (${(meta.size / 1e6).toFixed(1)} MB)`);
      return sendJson(res, 200, meta);
    }

    const videoMatch = /^\/api\/video\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    if (videoMatch) {
      const metaPath = join(DOWNLOADS, `${videoMatch[1]}.meta.json`);
      if (!existsSync(metaPath)) return sendJson(res, 404, { error: 'Vídeo no encontrado. Pide antes /api/reel.' });
      const meta = JSON.parse(await readFile(metaPath, 'utf8'));
      const file = join(DOWNLOADS, `${meta.id}.${meta.ext}`);
      res.writeHead(200, { 'Content-Type': meta.mimeType, 'Content-Length': statSync(file).size });
      return createReadStream(file).pipe(res);
    }

    sendJson(res, 404, { error: 'Ruta no encontrada.' });
  } catch (e) {
    console.error(`✗ ${e.message}`);
    sendJson(res, e.status ?? 500, { error: e.message });
  }
});

// ----------------------------------------------------------------- arranque

mkdirSync(DOWNLOADS, { recursive: true });
cleanOldDownloads();

const ytdlp = await detectYtdlp();
if (!ytdlp) {
  console.error('No se encontró yt-dlp. Instálalo con:  pip install yt-dlp');
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(`Bibliotheke Companion en http://localhost:${PORT}`);
  console.log(`  yt-dlp ${ytdlp.version} (${ytdlp.cmd}${ytdlp.pre.length ? ' ' + ytdlp.pre.join(' ') : ''})`);
  console.log(`  cookies.txt: ${existsSync(COOKIES) ? 'sí' : 'no (solo hará falta si un reel pide login)'}`);
  console.log('Deja esta ventana abierta mientras importas reels en Bibliotheke.');
});
