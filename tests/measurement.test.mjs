import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
let MeasurementClient;
try { ({MeasurementClient} = await import('../src/roomping/static/measurement.mjs')); } catch {}
async function host(t, behaviour = {}) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/run/start') return res.end('{"runId":"r1"}');
    if (req.url === '/api/run/end') return res.end('{"ok":true}');
    if (req.url.startsWith('/api/ping')) return res.end('{"ok":true}');
    if (req.url.startsWith('/api/download')) {
      if (behaviour.downloadError) { res.writeHead(500); return res.end('{}'); }
      const size = Number(new URL(req.url, 'http://local').searchParams.get('bytes'));
      res.setHeader('Content-Type', 'application/octet-stream'); res.setHeader('Content-Length', size);
      res.write(Buffer.alloc(1));
      return setTimeout(() => res.end(Buffer.alloc(size - 1)), behaviour.delay || 70);
    }
    if (req.url === '/api/upload') {
      let bytes = 0; for await (const part of req) bytes += part.length;
      return res.end(JSON.stringify({receivedBytes: bytes + (behaviour.badAck ? 1 : 0)}));
    }
    res.writeHead(404); res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return new MeasurementClient({baseUrl: `http://127.0.0.1:${server.address().port}`, token: 'test'});
}
test('download duration includes the complete delayed response body', async t => {
  assert.ok(MeasurementClient, 'MeasurementClient not implemented');
  const client = await host(t); const result = await client.measure({bytes: 4096, repeats: 1, latencyCount: 3});
  assert.equal(result.download[0].bytes, 4096); assert.ok(result.download[0].durationMs >= 50);
  assert.equal(result.upload[0].bytes, 4096); assert.equal(result.latencyMs.length, 3);
});
test('server error never returns a completed measurement', async t => {
  assert.ok(MeasurementClient, 'MeasurementClient not implemented');
  const client = await host(t, {downloadError: true});
  await assert.rejects(client.measure({bytes: 4096, repeats: 1, latencyCount: 1}), /500/);
});
test('upload acknowledgement byte mismatch fails the whole run', async t => {
  assert.ok(MeasurementClient, 'MeasurementClient not implemented');
  const client = await host(t, {badAck: true});
  await assert.rejects(client.measure({bytes: 4096, repeats: 1, latencyCount: 1}), /バイト/);
});
test('cancellation while reading body rejects without completed values', async t => {
  assert.ok(MeasurementClient, 'MeasurementClient not implemented');
  const client = await host(t, {delay: 150}); const controller = new AbortController();
  const pending = client.measure({bytes: 4096, repeats: 1, latencyCount: 1, signal: controller.signal,
    onProgress: value => { if (value.phase === 'download') setTimeout(() => controller.abort(), 20); }});
  await assert.rejects(pending, /中断|abort/i);
});
test('a second measurement from the same client is refused while busy', async t => {
  assert.ok(MeasurementClient, 'MeasurementClient not implemented');
  const client = await host(t); const first = client.measure({bytes: 4096, repeats: 1, latencyCount: 1});
  await assert.rejects(client.measure({bytes: 4096, repeats: 1, latencyCount: 1}), /測定中/);
  await first;
});
