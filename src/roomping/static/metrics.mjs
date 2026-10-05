/** Pure dataset boundary and calculation code, shared by browser and Node tests. */
export const LIMITS = Object.freeze({points: 500, conditions: 50, measurements: 5000,
  imageBytes: 5 * 1024 * 1024, jsonBytes: 12 * 1024 * 1024, pixels: 16_000_000,
  transferBytes: 16 * 1024 * 1024, samples: 20});
function fail(message) { throw new Error(message); }
function object(value, keys, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(k => !keys.includes(k)) || keys.some(k => !(k in value))) fail(`${name}: 項目が不正です`);
}
function number(value, min, max, name) {
  if (!Number.isFinite(value) || value < min || value > max) fail(`${name}: 数値が範囲外です`);
  return value;
}
function text(value, max, name, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim()) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) fail(`${name}: 文字列が不正です`);
  return value;
}
function id(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) fail('IDが不正です'); return value; }
function list(value, max, name, min = 0) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${name}: 件数が不正です`);
}
export function mbps(bytes, durationMs) {
  number(bytes, 1, Number.MAX_SAFE_INTEGER, 'bytes'); number(durationMs, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER, 'duration');
  const result = bytes * 8 / durationMs / 1000;
  if (!Number.isFinite(result) || result <= 0) fail('転送速度を計算できません');
  return result;
}
export function median(values) {
  list(values, LIMITS.samples, 'latency', 1);
  const sorted = values.map(v => number(v, Number.MIN_VALUE, 15000, 'latency')).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function transferSamples(samples) {
  list(samples, LIMITS.samples, 'transfer', 1);
  return samples.map(sample => {
    object(sample, ['bytes', 'durationMs'], 'sample');
    number(sample.bytes, 1, LIMITS.transferBytes, 'bytes');
    if (!Number.isInteger(sample.bytes)) fail('bytes: 整数が必要です');
    number(sample.durationMs, Number.MIN_VALUE, 15000, 'duration');
    mbps(sample.bytes, sample.durationMs);
    return {bytes: sample.bytes, durationMs: sample.durationMs};
  });
}
export function transferRate(samples) {
  const valid = transferSamples(samples);
  return mbps(valid.reduce((n, s) => n + s.bytes, 0), valid.reduce((n, s) => n + s.durationMs, 0));
}
export function emptyDataset() {
  return {version: 1, floorplan: {name: '空白の図', image: null, width: 1000, height: 700},
    points: [], conditions: [{id: 'condition_initial', name: 'ルーター移動前', notes: ''}], measurements: []};
}
export function validateDataset(data) {
  object(data, ['version', 'floorplan', 'points', 'conditions', 'measurements'], 'document');
  if (data.version !== 1) fail('対応していない保存形式です');
  object(data.floorplan, ['name', 'image', 'width', 'height'], 'floorplan');
  const floorplan = data.floorplan;
  text(floorplan.name, 200, 'floorplan name');
  number(floorplan.width, 1, 8192, 'width'); number(floorplan.height, 1, 8192, 'height');
  if (!Number.isInteger(floorplan.width) || !Number.isInteger(floorplan.height) || floorplan.width * floorplan.height > LIMITS.pixels) fail('画像の画素数が上限を超えています');
  if (floorplan.image !== null) {
    if (typeof floorplan.image !== 'string' || floorplan.image.length > Math.ceil(LIMITS.imageBytes * 4 / 3) + 100 ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(floorplan.image)) fail('画像形式が不正です');
    const [header, payload] = floorplan.image.split(',');
    if (payload.length % 4 !== 0) fail('画像のbase64が不正です');
    let binary; try { binary = atob(payload); } catch { fail('画像のbase64が不正です'); }
    if (binary.length > LIMITS.imageBytes) fail('画像の容量が上限を超えています');
    const png = binary.startsWith('\x89PNG\r\n\x1a\n');
    const jpeg = binary.startsWith('\xff\xd8\xff');
    const webp = binary.startsWith('RIFF') && binary.slice(8, 12) === 'WEBP';
    if (!(header.includes('/png;') ? png : header.includes('/jpeg;') ? jpeg : webp)) fail('画像の宣言と内容が一致しません');
  }
  list(data.points, LIMITS.points, 'points'); list(data.conditions, LIMITS.conditions, 'conditions');
  list(data.measurements, LIMITS.measurements, 'measurements');
  function unique(values) {
    const ids = new Set(); for (const value of values) { id(value.id); if (ids.has(value.id)) fail('IDが重複しています'); ids.add(value.id); } return ids;
  }
  const points = data.points.map(p => {
    object(p, ['id', 'label', 'x', 'y'], 'point');
    text(p.label, 80, 'point label'); number(p.x, 0, 1, 'x'); number(p.y, 0, 1, 'y');
    return {id: id(p.id), label: p.label, x: p.x, y: p.y};
  });
  const conditions = data.conditions.map(c => {
    object(c, ['id', 'name', 'notes'], 'condition'); text(c.name, 80, 'condition name'); text(c.notes, 1000, 'condition notes', true);
    return {id: id(c.id), name: c.name, notes: c.notes};
  });
  const pointIds = unique(points), conditionIds = unique(conditions);
  const measurements = data.measurements.map(m => {
    object(m, ['id', 'pointId', 'conditionId', 'timestamp', 'latencyMs', 'download', 'upload', 'device', 'mode'], 'measurement');
    if (!pointIds.has(m.pointId) || !conditionIds.has(m.conditionId)) fail('測定の地点または条件がありません');
    if (m.mode !== 'measured') fail('実測データのみ読み込めます');
    text(m.timestamp, 40, 'timestamp');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(m.timestamp) || !Number.isFinite(Date.parse(m.timestamp)) || new Date(m.timestamp).toISOString() !== m.timestamp) fail('測定日時が不正です');
    text(m.device, 300, 'device'); median(m.latencyMs);
    return {id: id(m.id), pointId: m.pointId, conditionId: m.conditionId, timestamp: m.timestamp,
      latencyMs: [...m.latencyMs], download: transferSamples(m.download), upload: transferSamples(m.upload), device: m.device, mode: 'measured'};
  });
  unique(measurements);
  const valid = {version: 1, floorplan: {...floorplan}, points, conditions, measurements};
  // Every accepted state must fit the same UTF-8 boundary as its JSON import.
  if (new TextEncoder().encode(JSON.stringify(valid)).byteLength > LIMITS.jsonBytes)
    fail('記録全体の JSON 容量が 12 MiB を超えています。現在の記録を保存し、新しい図で測定してください');
  return valid;
}
export function toJSON(data) { return JSON.stringify(validateDataset(data)); }
export function appendMeasurement(data, measurement) {
  return validateDataset({...data, measurements: [...data.measurements, measurement]});
}
export function latest(data, pointId, conditionId) {
  return data.measurements.filter(m => m.pointId === pointId && m.conditionId === conditionId).at(-1) || null;
}
export function comparePoint(data, pointId, beforeId, afterId) {
  const before = latest(data, pointId, beforeId), after = latest(data, pointId, afterId);
  if (!before || !after || beforeId === afterId) return null;
  return {before, after, downloadDelta: transferRate(after.download) - transferRate(before.download),
    uploadDelta: transferRate(after.upload) - transferRate(before.upload), latencyDelta: median(after.latencyMs) - median(before.latencyMs)};
}
function csvCell(value) {
  let s = String(value);
  if (/^[\s]*[=+\-@＝＋－＠]/.test(s) || /^[\t\r\n]/.test(s)) s = '\t' + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function toCSV(data) {
  const valid = validateDataset(data);
  const rows = [['measurement_id','timestamp_utc','point','x_normalized','y_normalized','condition','notes','http_rtt_median_ms','download_mbps','upload_mbps','latency_samples','download_bytes','download_duration_ms','upload_bytes','upload_duration_ms','device','mode']];
  for (const m of valid.measurements) {
    const point = valid.points.find(p => p.id === m.pointId), condition = valid.conditions.find(c => c.id === m.conditionId);
    rows.push([m.id,m.timestamp,point.label,point.x,point.y,condition.name,condition.notes,median(m.latencyMs),transferRate(m.download),transferRate(m.upload),m.latencyMs.length,
      m.download.reduce((n,s) => n+s.bytes,0),m.download.reduce((n,s) => n+s.durationMs,0),m.upload.reduce((n,s) => n+s.bytes,0),m.upload.reduce((n,s) => n+s.durationMs,0),m.device,m.mode]);
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
