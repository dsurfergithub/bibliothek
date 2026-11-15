import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createExtractor, reelId } from '../companion/remote.mjs';

const token = 'test-secret-with-at-least-24-characters';
const origin = 'https://bibliothek-two.vercel.app';
const headers = { Authorization: `Bearer ${token}`, Origin: origin };
const target = '/api/reel?url=' + encodeURIComponent('https://www.instagram.com/reel/Example1234/');
const bytes = Buffer.from('fixture-video');
async function fixture(id, dir) {
  await writeFile(`${dir}/video.mp4`, bytes);
  return { caption: 'Texto del reel', uploader: 'autor' };
}
async function service(t, options = {}) {
  const server = createExtractor({ token, origins: [origin], download: fixture, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return (path, init = {}) => fetch(base + path, { headers, ...init });
}

test('solo admite enlaces reales de Instagram y reconstruye la identidad', () => {
  assert.equal(reelId('https://www.instagram.com/reel/Example1234/?igsh=abc'), 'Example1234');
  for (const url of ['http://127.0.0.1/reel/Example1234/', 'https://instagram.com.evil.com/reel/Example1234/',
    'https://instagram.com:444/reel/Example1234/', 'https://user:pass@instagram.com/reel/Example1234/',
    'file:///reel/Example1234/', 'https://instagram.com/reel/Example1234/extra', '--help']) {
    assert.throws(() => reelId(url));
  }
});

test('el servicio remoto requiere secreto y orígenes explícitos', () => {
  assert.throws(() => createExtractor({ token: 'short', origins: [origin] }));
  assert.throws(() => createExtractor({ token, origins: ['*'] }));
});

test('rechaza peticiones sin clave o desde otra web; permite preflight', async t => {
  const request = await service(t);
  for (const path of ['/health', target, '/api/video/Example1234']) {
    assert.equal((await request(path, { headers: {} })).status, 401);
  }
  assert.equal((await request('/health', { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
  const preflight = await request('/api/reel', { method: 'OPTIONS', headers: { Origin: origin } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal(preflight.headers.get('access-control-allow-headers'), 'Authorization');
  assert.equal((await request('/ready', { headers: {} })).status, 200);
});

test('URL → descarga → metadatos y vídeo autenticados, con caché y caption', async t => {
  let downloads = 0;
  const request = await service(t, { download: async (...args) => { downloads++; return fixture(...args); } });
  const replies = await Promise.all([request(target), request(target)]);
  assert.ok(replies.every(r => r.status === 200));
  const meta = await replies[0].json();
  assert.equal(meta.caption, 'Texto del reel');
  assert.equal(meta.uploader, 'autor');
  assert.equal(meta.videoUrl, '/api/video/Example1234');
  const video = await request(meta.videoUrl);
  assert.equal(video.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await video.arrayBuffer()), bytes);
  assert.equal(downloads, 1);
  assert.equal((await request(target)).status, 200);
  assert.equal(downloads, 1);
});

test('un bloqueo de Instagram no crea ficha ni expone errores internos; permite reintento', async t => {
  let calls = 0;
  const request = await service(t, { download: async (...args) => {
    if (++calls === 1) throw Object.assign(new Error('Instagram pide sesión. Sube el vídeo desde tu galería.'), { status: 502 });
    return fixture(...args);
  } });
  const failed = await request(target);
  assert.equal(failed.status, 502);
  assert.match((await failed.json()).error, /galería/);
  assert.equal((await request('/api/video/Example1234')).status, 404);
  assert.equal((await request(target)).status, 200);
});

test('la caché caduca y los vídeos vacíos se rechazan', async t => {
  const request = await service(t, { cacheMs: -1 });
  assert.equal((await request(target)).status, 200);
  assert.equal((await request('/api/video/Example1234')).status, 404);
  const empty = await service(t, { download: async (id, dir) => {
    await writeFile(`${dir}/video.mp4`, ''); return {};
  } });
  assert.equal((await empty(target)).status, 422);
});

test('no ejecuta el extractor para URLs arbitrarias ni para POST', async t => {
  let calls = 0;
  const request = await service(t, { download: () => { calls++; throw new Error('should not run'); } });
  assert.equal((await request('/api/reel?url=https://localhost/')).status, 400);
  assert.equal((await request(target, { method: 'POST' })).status, 405);
  assert.equal(calls, 0);
});
