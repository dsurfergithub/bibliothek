import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getExtractorConfig, setExtractorConfig, checkExtractor, fetchReel } from '../src/services/companion.ts';
const values = new Map();
globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };

test('solo guarda servicios HTTPS y no acepta credenciales dentro de la URL', () => {
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/health', 'https://example.com?token=x']) {
    assert.throws(() => setExtractorConfig(url, 'access-token'));
  }
  setExtractorConfig('https://example.com/', 'access-token');
  assert.deepEqual(getExtractorConfig(), { url: 'https://example.com', token: 'access-token' });
  setExtractorConfig('', '');
  assert.equal(getExtractorConfig().url, '');
});

test('envía la autorización al extractor y devuelve el vídeo y su caption', async t => {
  const calls = [];
  setExtractorConfig('https://example.com', 'access-token');
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/api/reel?')) return Response.json({ id: 'Example1234', caption: 'Caption', uploader: 'Autor', mimeType: 'video/mp4', videoUrl: '/api/video/Example1234' });
    return new Response('video', { headers: { 'Content-Type': 'video/mp4' } });
  });
  const result = await fetchReel('https://instagram.com/reel/Example1234/');
  assert.equal(await result.file.text(), 'video');
  assert.equal(result.caption, 'Caption');
  assert.equal(result.uploader, 'Autor');
  assert.ok(calls.every(c => c.options.headers.Authorization === 'Bearer access-token'));
  assert.ok(calls.every(c => !JSON.stringify(c).includes('gemini')));
});

test('no reenvía el token a una URL de vídeo externa', async t => {
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    count++;
    return Response.json({ id: 'Example1234', videoUrl: 'https://evil.example/video' });
  });
  await assert.rejects(fetchReel('https://instagram.com/reel/Example1234/'), /no válida/);
  assert.equal(count, 1);
});

test('una clave incorrecta se muestra como error de conexión', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 401 }));
  await assert.rejects(checkExtractor(), /clave de acceso/);
  await assert.rejects(fetchReel('https://instagram.com/reel/Example1234/'), /clave del servicio/);
});
