import test from 'node:test';
import assert from 'node:assert/strict';
let api;
try { api = await import('../src/roomping/static/metrics.mjs'); } catch {}
function available() { assert.ok(api, 'RoomPing metrics module has not been implemented'); }
function fixture() {
  return {version: 1, floorplan: {name: '空白', image: null, width: 1000, height: 700},
    points: [{id: 'p1', label: '窓際', x: 0.25, y: 0.75}],
    conditions: [{id: 'c1', name: '移動前', notes: 'PC有線'}],
    measurements: [{id: 'm1', pointId: 'p1', conditionId: 'c1', timestamp: '2026-10-03T00:00:00.000Z',
      latencyMs: [2, 4, 3], download: [{bytes: 8000000, durationMs: 2000}],
      upload: [{bytes: 1000000, durationMs: 1000}], device: 'phone', mode: 'measured'}]};
}
function largeFixture() {
  const data = fixture(), durationMs = 123.456789;
  const sample = {bytes: 16777216, durationMs};
  data.measurements = Array.from({length: 5000}, (_, i) => ({...data.measurements[0], id: `m${i}`,
    latencyMs: Array(20).fill(durationMs), download: Array(20).fill(sample),
    upload: Array(20).fill(sample), device: 'x'.repeat(300)}));
  return data;
}
test('decimal Mbps uses completed byte count and elapsed seconds', () => {
  available(); assert.equal(api.mbps(8000000, 2000), 32);
  for (const n of [0, -1, Infinity, NaN, '1']) assert.throws(() => api.mbps(1, n));
});
test('latency median does not sort original samples', () => {
  available(); const values = [9, 2, 4, 6]; assert.equal(api.median(values), 5);
  assert.deepEqual(values, [9, 2, 4, 6]); assert.throws(() => api.median([]));
});
test('transfer aggregate is byte-weighted rather than average of rates', () => {
  available(); assert.equal(api.transferRate([{bytes: 1000000, durationMs: 1000}, {bytes: 1000000, durationMs: 3000}]), 4);
});
test('valid JSON round-trip retains exact coordinates and raw samples', () => {
  available(); assert.deepEqual(api.validateDataset(JSON.parse(JSON.stringify(fixture()))), fixture());
});
test('large valid JSON export fits the import limit and preserves every sample', () => {
  available(); const data = largeFixture();
  assert.ok(Buffer.byteLength(JSON.stringify(data)) < 12582912);
  assert.ok(Buffer.byteLength(JSON.stringify(data, null, 2)) > 12582912);
  const exported = api.toJSON(data);
  assert.ok(Buffer.byteLength(exported) <= 12582912);
  assert.deepEqual(api.validateDataset(JSON.parse(exported)), data);
});
test('combined JSON capacity uses UTF-8 bytes and rejects an oversized valid schema', () => {
  available(); const data = largeFixture();
  for (const m of data.measurements) m.device = '📶'.repeat(150);
  assert.ok(JSON.stringify(data).length < 12582912);
  assert.ok(Buffer.byteLength(JSON.stringify(data)) > 12582912);
  assert.throws(() => api.validateDataset(data), /12 MiB/);
});
test('append crossing the JSON capacity retains the complete prior dataset', () => {
  available(); const candidate = largeFixture();
  for (let i = 0; i < 2013; i++) candidate.measurements[i].device = '📶'.repeat(150);
  const next = candidate.measurements.pop();
  const data = api.validateDataset(candidate), before = JSON.stringify(data);
  assert.ok(Buffer.byteLength(before) <= 12582912);
  assert.ok(Buffer.byteLength(JSON.stringify({...candidate, measurements:[...candidate.measurements,next]})) > 12582912);
  assert.throws(() => api.appendMeasurement(data, next), /12 MiB/);
  assert.equal(JSON.stringify(data), before);
});
test('import rejects nonfinite values and coercible strings', () => {
  available(); for (const value of [Infinity, NaN, -1, 1.01, '0.5', null]) {
    const data = fixture(); data.points[0].x = value; assert.throws(() => api.validateDataset(data));
  }
  const data = JSON.parse(JSON.stringify(fixture()).replace('2000', '1e999'));
  assert.throws(() => api.validateDataset(data));
});
test('import rejects missing references duplicate IDs and unsupported schema', () => {
  available(); for (const mutate of [d => d.version = 2, d => d.measurements[0].pointId = 'none',
    d => d.points.push({...d.points[0]}), d => d.measurements[0].mode = 'demo',
    d => d.measurements[0].upload = [], d => d.conditions[0].name = 'x'.repeat(81),
    d => d.points = Array.from({length: 501}, (_, i) => ({id: `p${i}`, label: 'p', x: 0, y: 0}))]) {
    const data = fixture(); mutate(data); assert.throws(() => api.validateDataset(data));
  }
});
test('failed completed-record validation cannot mutate current dataset', () => {
  available(); const data = fixture(); const before = JSON.stringify(data);
  const bad = {...data.measurements[0], id: 'm2', upload: []};
  assert.throws(() => api.appendMeasurement(data, bad)); assert.equal(JSON.stringify(data), before);
});
test('image imports reject remote URLs SVG invalid dimensions and excessive pixels', () => {
  available(); for (const image of ['https://example.com/map.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,!']) {
    const data = fixture(); data.floorplan.image = image; assert.throws(() => api.validateDataset(data));
  }
  const data = fixture(); data.floorplan.width = 100000; assert.throws(() => api.validateDataset(data));
});
test('image declaration must match actual binary signature', () => {
  available(); const data = fixture(); data.floorplan.image = 'data:image/png;base64,YWJj';
  assert.throws(() => api.validateDataset(data));
});
test('CSV preserves Japanese and escapes quotes commas newlines and formulas', () => {
  available(); const data = fixture(); data.points[0].label = '=SUM(1,2)';
  data.conditions[0].notes = '日本語,"引用"\n二行'; const csv = api.toCSV(data);
  assert.ok(csv.includes('"\t=SUM(1,2)"')); assert.ok(csv.includes('"日本語,""引用""\n二行"'));
  assert.ok(csv.includes('32')); assert.ok(csv.includes('3'));
});
test('comparison pairs the same point across two conditions only', () => {
  available(); const data = fixture(); data.conditions.push({id:'c2', name:'移動後', notes:''});
  data.measurements.push({...data.measurements[0], id:'m2', conditionId:'c2', download:[{bytes:8000000,durationMs:1000}]});
  assert.equal(api.comparePoint(data, 'p1', 'c1', 'c2').downloadDelta, 32);
  assert.equal(api.comparePoint(data, 'missing', 'c1', 'c2'), null);
});
