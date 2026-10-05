import test from 'node:test';
import assert from 'node:assert/strict';
import {MeasurementClient} from '../src/roomping/static/measurement.mjs';

test('no-referrer page retains usable POST Origin throughout a complete run', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const origin = 'http://127.0.0.1:8767';
  // Node does not implement document referrer policy. This boundary fixture applies
  // Fetch's Origin algorithm for the page's no-referrer policy, then server semantics.
  globalThis.fetch = async (url, options) => {
    const request = new Request(url, options);
    const path = new URL(url).pathname;
    if (request.method === 'POST') {
      const serializedOrigin = request.mode === 'cors' ? origin : 'null';
      if (serializedOrigin !== origin) return Response.json({error:'Origin is not allowed'}, {status:403});
    }
    if (path === '/api/run/start') return Response.json({runId:'run-origin'});
    if (path === '/api/run/end' || path === '/api/ping') return Response.json({ok:true});
    if (path === '/api/download') {
      const bytes = Number(new URL(url).searchParams.get('bytes'));
      return new Response(new Uint8Array(bytes), {headers:{'Content-Length':String(bytes)}});
    }
    if (path === '/api/upload') return Response.json({receivedBytes:(await request.arrayBuffer()).byteLength});
    return Response.json({}, {status:404});
  };
  const client = new MeasurementClient({baseUrl:origin,token:'private'});
  const result = await client.measure({bytes:1024,repeats:1,latencyCount:1});
  assert.equal(result.download[0].bytes,1024);
  assert.equal(result.upload[0].bytes,1024);
  assert.equal(client.busy,false);
});
