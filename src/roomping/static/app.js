import {LIMITS, emptyDataset, validateDataset, appendMeasurement, latest, median, transferRate, comparePoint, toJSON, toCSV} from './metrics.mjs';
import {MeasurementClient} from './measurement.mjs';
import {getLanguage, pickLanguage, setLanguage, t} from './i18n.mjs';

const $ = id => document.getElementById(id);
function savedLanguage() { try { return localStorage.getItem('roomping-lang'); } catch { return null; } }
setLanguage(pickLanguage({search: location.search || '', saved: savedLanguage(),
  languages: navigator.languages?.length ? navigator.languages : [navigator.language || '']}));
const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
const client = new MeasurementClient({token});
let data = emptyDataset(), selectedPoint = '', selectedCondition = data.conditions[0].id;
let controller = null, connected = false, pendingImport = null;
let lastMessage = {key: 'join_from_url', params: {}, error: false}, connectionKey = 'checking_connection';
function uid(prefix) { const bytes = crypto.getRandomValues(new Uint8Array(10)); return prefix + '_' + [...bytes].map(b => b.toString(16).padStart(2,'0')).join(''); }
// Messages are kept as keys so switching language can redraw the current one.
function message(key, params = {}, error = false) { lastMessage = {key, params, error}; showMessage(); }
function showMessage() { $('status').textContent = t(lastMessage.key, lastMessage.params); $('status').classList.toggle('error', lastMessage.error); }
function showConnection() { $('connection').textContent = t(connectionKey); }
function applyText() {
  document.documentElement.lang = getLanguage();
  document.title = t('page_title');
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const element of document.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of element.dataset.i18nAttr.split(';')) {
      const [attribute, name] = pair.split(':');
      element.setAttribute(attribute, t(name));
    }
  }
  $('lang').textContent = t('switch_language');
  $('lang').setAttribute('lang', getLanguage() === 'ja' ? 'en' : 'ja');
  showMessage(); showConnection();
}
function commitDataset(candidate) {
  try { data = validateDataset(candidate); message('record_updated'); return true; }
  catch (error) { render(); message('kept_current', {error: error.message}, true); return false; }
}
function point() { return data.points.find(p => p.id === selectedPoint); }
function condition() { return data.conditions.find(c => c.id === selectedCondition); }
function n(value) { return value.toFixed(1); }
function option(parent, value, label) { const o = document.createElement('option'); o.value = value; o.textContent = label; parent.append(o); }
function setBusy(busy) {
  for (const id of ['floorplan-file','blank-plan','point-name','point-select','condition-select','condition-name','condition-notes','add-condition','transfer-size','repeats','import-json','confirm-import']) $(id).disabled = busy;
  $('point-name').disabled = busy || !point();
  $('measure').disabled = busy || !connected || !point() || !condition();
  $('cancel').hidden = !busy; $('progress').hidden = !busy;
  $('map').setAttribute('aria-busy', String(busy));
}
function render() {
  const p = point();
  $('point-count').textContent = t('spot_count', {n: data.points.length});
  $('measurement-count').textContent = t('measurement_count', {n: data.measurements.length});
  $('map').style.aspectRatio = `${data.floorplan.width} / ${data.floorplan.height}`;
  $('map').classList.toggle('blank', !data.floorplan.image);
  $('floorplan-image').hidden = !data.floorplan.image;
  if (data.floorplan.image) $('floorplan-image').src = data.floorplan.image; else $('floorplan-image').removeAttribute('src');
  $('empty-map').hidden = data.points.length > 0 || !!data.floorplan.image;
  $('markers').replaceChildren();
  data.points.forEach((item, i) => {
    const marker = document.createElement('button'); marker.type = 'button';
    const measured = data.measurements.some(m => m.pointId === item.id);
    marker.className = `marker${item.id === selectedPoint ? ' selected' : ''}${measured ? '' : ' pending'}`;
    marker.style.left = `${item.x * 100}%`; marker.style.top = `${item.y * 100}%`;
    marker.textContent = String(i + 1); marker.title = item.label;
    marker.setAttribute('aria-label', t(measured ? 'marker_measured' : 'marker_pending', {label: item.label}));
    marker.addEventListener('click', event => { event.stopPropagation(); if (!client.busy) { selectedPoint = item.id; render(); } });
    $('markers').append(marker);
  });
  $('point-select').replaceChildren(); option($('point-select'), '', t('choose_spot'));
  data.points.forEach(item => option($('point-select'), item.id, item.label)); $('point-select').value = selectedPoint;
  $('point-name').value = p?.label || '';
  $('coordinates').textContent = p ? t('position', {x: n(p.x * 100), y: n(p.y * 100)}) : t('no_spot');
  const before = $('before-condition').value, after = $('after-condition').value;
  for (const id of ['condition-select','before-condition','after-condition']) {
    $(id).replaceChildren(); data.conditions.forEach(c => option($(id), c.id, c.name));
  }
  $('condition-select').value = selectedCondition;
  $('condition-notes').value = condition()?.notes || '';
  const known = id => data.conditions.some(c => c.id === id);
  const beforeId = known(before) ? before : data.conditions[0]?.id || '';
  // A pair of identical conditions compares nothing, for example right after adding a
  // second condition: default "after" to the condition being measured instead.
  const afterId = known(after) && after !== beforeId ? after
    : [selectedCondition, ...data.conditions.map(c => c.id)].find(id => known(id) && id !== beforeId) || beforeId;
  $('before-condition').value = beforeId;
  $('after-condition').value = afterId;
  renderResults(); setBusy(client.busy);
}
function renderResults() {
  $('results').replaceChildren();
  const records = data.conditions.map(c => ({condition:c, measurement:latest(data, selectedPoint, c.id)})).filter(r => r.measurement);
  $('results-empty').hidden = records.length > 0;
  $('results-empty').textContent = point() ? t('spot_unmeasured') : t('select_spot');
  const grid = document.createElement('div'); grid.className = 'result-grid';
  const locale = getLanguage() === 'ja' ? 'ja-JP' : 'en-US';
  for (const {condition:c, measurement:m} of records) {
    const card = document.createElement('article'); card.className = 'result-item';
    const title = document.createElement('h3'); title.textContent = `${point().label} · ${c.name}`; card.append(title);
    for (const [label,value,unit] of [[t('rtt_median'),median(m.latencyMs),'ms'],[t('phase_download'),transferRate(m.download),'Mbps'],[t('phase_upload'),transferRate(m.upload),'Mbps']]) {
      const row = document.createElement('div'); row.className = 'metric-row';
      const l = document.createElement('span'); l.textContent = label;
      const strong = document.createElement('strong'); strong.textContent = n(value);
      const small = document.createElement('small'); small.textContent = unit; strong.append(small); row.append(l,strong); card.append(row);
    }
    const detail = document.createElement('p');
    detail.textContent = t('result_detail', {time: new Date(m.timestamp).toLocaleString(locale), rtt: m.latencyMs.length, transfers: m.download.length}) + `\n${c.notes}`;
    card.append(detail);
    if ([...m.download,...m.upload].some(s => s.durationMs < 250)) {
      const warning = document.createElement('p'); warning.textContent = t('short_samples'); card.append(warning);
    }
    grid.append(card);
  }
  $('results').append(grid); renderComparison();
}
function renderComparison() {
  const compared = comparePoint(data, selectedPoint, $('before-condition').value, $('after-condition').value);
  const signed = value => `${value >= 0 ? '+' : ''}${n(value)}`;
  $('comparison-result').textContent = compared
    ? t('comparison', {down: signed(compared.downloadDelta), up: signed(compared.uploadDelta), rtt: signed(compared.latencyDelta)})
    : t('comparison_hint');
}
function traffic() { $('traffic').textContent = t('traffic', {total: Number($('transfer-size').value) * Number($('repeats').value) * 2 / 1048576}); }
function exportFile(name, contents, type) {
  const link = document.createElement('a'), url = URL.createObjectURL(new Blob([contents], {type}));
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function decodeImage(image, width, height) {
  const img = new Image(); img.src = image; await img.decode();
  if (!img.naturalWidth || img.naturalWidth > 8192 || img.naturalHeight > 8192 || img.naturalWidth * img.naturalHeight > LIMITS.pixels ||
    (width !== undefined && (img.naturalWidth !== width || img.naturalHeight !== height))) throw new Error(t('bad_image_size'));
  return img;
}
function replaceFloorplan(floorplan) {
  if (data.points.length && !window.confirm(t('confirm_floorplan'))) return;
  data = validateDataset({...data, floorplan, points:[], measurements:[]}); selectedPoint = ''; render(); message('floorplan_set');
}
$('lang').addEventListener('click', () => {
  setLanguage(getLanguage() === 'ja' ? 'en' : 'ja');
  try { localStorage.setItem('roomping-lang', getLanguage()); } catch {}
  applyText(); render(); traffic();
});
$('map').addEventListener('click', event => {
  if (client.busy) return;
  if (data.points.length >= LIMITS.points) return message('spot_limit', {}, true);
  const rect = $('map').getBoundingClientRect();
  const x = Math.max(0,Math.min(1,(event.clientX - rect.left) / rect.width));
  const y = Math.max(0,Math.min(1,(event.clientY - rect.top) / rect.height));
  const created = {id:uid('point'),label:t('new_spot', {n: data.points.length + 1}),x,y};
  if (commitDataset({...data, points:[...data.points,created]})) { selectedPoint = created.id; render(); }
});
$('point-select').addEventListener('change', () => { selectedPoint = $('point-select').value; render(); });
$('point-name').addEventListener('change', () => {
  if (!point()) return; const value = $('point-name').value.trim();
  if (!value) return render();
  if (commitDataset({...data, points:data.points.map(p => p.id === selectedPoint ? {...p,label:value} : p)})) render();
});
$('condition-select').addEventListener('change', () => { selectedCondition = $('condition-select').value; render(); });
$('add-condition').addEventListener('click', () => {
  const name = $('condition-name').value.trim(); if (!name) return message('enter_condition', {}, true);
  if (data.conditions.length >= LIMITS.conditions) return message('condition_limit', {}, true);
  if (data.conditions.some(c => c.name === name)) return message('condition_exists', {}, true);
  const created = {id:uid('condition'),name,notes:''};
  if (commitDataset({...data,conditions:[...data.conditions,created]})) { selectedCondition = created.id; $('condition-name').value = ''; render(); }
});
$('condition-notes').addEventListener('change', () => {
  if (commitDataset({...data,conditions:data.conditions.map(c => c.id === selectedCondition ? {...c,notes:$('condition-notes').value} : c)})) renderResults();
});
for (const id of ['before-condition','after-condition']) $(id).addEventListener('change',renderComparison);
for (const id of ['transfer-size','repeats']) $(id).addEventListener('change',traffic);
$('measure').addEventListener('click', async () => {
  if (!point() || !condition() || client.busy) return;
  if (data.measurements.length >= LIMITS.measurements) return message('measurement_limit', {}, true);
  const pointId = selectedPoint, conditionId = selectedCondition;
  controller = new AbortController(); setBusy(true); message('measuring');
  try {
    const results = await client.measure({bytes:Number($('transfer-size').value),repeats:Number($('repeats').value),signal:controller.signal,
      onProgress: p => { $('progress-text').textContent = t('progress', {phase: t(`phase_${p.phase}`), current: p.current, total: p.total}); }});
    if (controller.signal.aborted) throw new Error(t('cancelled'));
    data = appendMeasurement(data,{id:uid('measurement'),pointId,conditionId,timestamp:new Date().toISOString(),...results,device:navigator.userAgent.slice(0,300),mode:'measured'});
    message('recorded');
  } catch (error) {
    message('not_recorded', {error: error.message || t('request_failed')}, true);
  } finally { controller = null; render(); }
});
$('cancel').addEventListener('click', () => controller?.abort(new Error(t('cancelled'))));
document.addEventListener('visibilitychange', () => { if (document.hidden) controller?.abort(new Error(t('hidden_cancelled'))); });
$('floorplan-file').addEventListener('change',async () => {
  const file = $('floorplan-file').files[0]; if (!file) return;
  try {
    if (file.size > LIMITS.imageBytes || !['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error(t('image_choice'));
    const image = await new Promise((resolve,reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error(t('image_unreadable'))); r.readAsDataURL(file); });
    const img = await decodeImage(image);
    replaceFloorplan({name:file.name.slice(0,200),image,width:img.naturalWidth,height:img.naturalHeight});
  } catch (error) { message('kept_current', {error: error.message}, true); } finally { $('floorplan-file').value = ''; }
});
$('blank-plan').addEventListener('click', () => replaceFloorplan(emptyDataset().floorplan));
$('export-json').addEventListener('click', () => exportFile('roomping.json',toJSON(data),'application/json'));
$('export-csv').addEventListener('click', () => exportFile('roomping.csv','﻿' + toCSV(data),'text/csv;charset=utf-8'));
$('import-json').addEventListener('change',async () => {
  const file = $('import-json').files[0]; if (!file) return;
  try {
    if (file.size > LIMITS.jsonBytes) throw new Error(t('json_limit'));
    const checked = validateDataset(JSON.parse(await file.text()));
    if (checked.floorplan.image) await decodeImage(checked.floorplan.image,checked.floorplan.width,checked.floorplan.height);
    pendingImport = checked;
    $('import-summary').textContent = t('import_summary', {file: file.name, points: checked.points.length, conditions: checked.conditions.length, measurements: checked.measurements.length});
    $('import-review').hidden = false; $('import-review').scrollIntoView({behavior:'smooth'}); message('import_checked');
  } catch (error) { pendingImport = null; $('import-review').hidden = true; message('import_failed', {error: error.message}, true); }
  finally { $('import-json').value = ''; }
});
$('confirm-import').addEventListener('click', () => {
  if (!pendingImport || client.busy) return; data = pendingImport; pendingImport = null;
  selectedPoint = data.points[0]?.id || ''; selectedCondition = data.conditions[0]?.id || ''; $('import-review').hidden = true; render(); message('record_loaded');
});
$('cancel-import').addEventListener('click', () => { pendingImport = null; $('import-review').hidden = true; });
window.addEventListener('beforeunload',event => { if (data.points.length) { event.preventDefault(); event.returnValue = ''; } });
async function connect() {
  if (!token) { connectionKey = 'view_only'; showConnection(); $('connection').classList.add('offline'); message('no_token', {}, true); return; }
  try {
    const info = await client.request('/api/info'); connected = true;
    connectionKey = 'host_connected'; showConnection(); $('connection').classList.add('connected');
    $('join-url').textContent = info.joinUrl; $('join-url').href = info.joinUrl;
    const qr = await client.request('/api/qr',{consume:r => r.blob()});
    $('join-qr').src = URL.createObjectURL(qr); $('join-qr').hidden = false;
    message('connected');
  } catch (error) {
    connected = false; connectionKey = 'host_missing'; showConnection(); $('connection').classList.add('offline');
    message('host_unreachable', {error: error.message}, true);
  } finally { setBusy(false); }
}
applyText(); render(); traffic(); connect();
