import {LIMITS, emptyDataset, validateDataset, appendMeasurement, latest, median, transferRate, comparePoint, toJSON, toCSV} from './metrics.mjs';
import {MeasurementClient} from './measurement.mjs';

const $ = id => document.getElementById(id);
const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
const client = new MeasurementClient({token});
let data = emptyDataset(), selectedPoint = '', selectedCondition = data.conditions[0].id;
let controller = null, connected = false, pendingImport = null;
const phaseNames = {warmup:'接続を準備', latency:'HTTP 往復応答', download:'PC → スマートフォン', upload:'スマートフォン → PC'};
function uid(prefix) { const bytes = crypto.getRandomValues(new Uint8Array(10)); return prefix + '_' + [...bytes].map(b => b.toString(16).padStart(2,'0')).join(''); }
function message(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function commitDataset(candidate) {
  try { data = validateDataset(candidate); message('記録を更新しました。'); return true; }
  catch (error) { render(); message(`${error.message}。現在の記録は保持しています。`, true); return false; }
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
  $('point-count').textContent = `${data.points.length} 地点`;
  $('measurement-count').textContent = `${data.measurements.length} 回の実測`;
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
    marker.setAttribute('aria-label', `${item.label}を選択${measured ? '、実測あり' : '、未測定'}`);
    marker.addEventListener('click', event => { event.stopPropagation(); if (!client.busy) { selectedPoint = item.id; render(); } });
    $('markers').append(marker);
  });
  $('point-select').replaceChildren(); option($('point-select'), '', '地点を選ぶ');
  data.points.forEach(item => option($('point-select'), item.id, item.label)); $('point-select').value = selectedPoint;
  $('point-name').value = p?.label || '';
  $('coordinates').textContent = p ? `位置 x ${n(p.x * 100)}% / y ${n(p.y * 100)}%` : 'まだ地点を選んでいません';
  const before = $('before-condition').value, after = $('after-condition').value;
  for (const id of ['condition-select','before-condition','after-condition']) {
    $(id).replaceChildren(); data.conditions.forEach(c => option($(id), c.id, c.name));
  }
  $('condition-select').value = selectedCondition;
  $('condition-notes').value = condition()?.notes || '';
  $('before-condition').value = data.conditions.some(c => c.id === before) ? before : data.conditions[0]?.id || '';
  $('after-condition').value = data.conditions.some(c => c.id === after) ? after : data.conditions[1]?.id || data.conditions[0]?.id || '';
  renderResults(); setBusy(client.busy);
}
function renderResults() {
  $('results').replaceChildren();
  const records = data.conditions.map(c => ({condition:c, measurement:latest(data, selectedPoint, c.id)})).filter(r => r.measurement);
  $('results-empty').hidden = records.length > 0;
  $('results-empty').textContent = point() ? 'この地点はまだ測定していません。条件を選んで測定してください。' : '地点を選択すると、条件ごとの実測結果を表示します。';
  const grid = document.createElement('div'); grid.className = 'result-grid';
  for (const {condition:c, measurement:m} of records) {
    const card = document.createElement('article'); card.className = 'result-item';
    const title = document.createElement('h3'); title.textContent = `${point().label} · ${c.name}`; card.append(title);
    for (const [label,value,unit] of [['HTTP 往復応答 (中央値)',median(m.latencyMs),'ms'],['PC → スマートフォン',transferRate(m.download),'Mbps'],['スマートフォン → PC',transferRate(m.upload),'Mbps']]) {
      const row = document.createElement('div'); row.className = 'metric-row';
      const l = document.createElement('span'); l.textContent = label;
      const strong = document.createElement('strong'); strong.textContent = n(value);
      const small = document.createElement('small'); small.textContent = unit; strong.append(small); row.append(l,strong); card.append(row);
    }
    const detail = document.createElement('p'); detail.textContent = `${new Date(m.timestamp).toLocaleString('ja-JP')} · 往復 ${m.latencyMs.length} 回 / 転送各 ${m.download.length} 回\n${c.notes}`; card.append(detail);
    if ([...m.download,...m.upload].some(s => s.durationMs < 250)) {
      const warning = document.createElement('p'); warning.textContent = '短い転送サンプルを含みます。速い LAN では 16 MiB で再測定すると比較しやすくなります。'; card.append(warning);
    }
    grid.append(card);
  }
  $('results').append(grid); renderComparison();
}
function renderComparison() {
  const compared = comparePoint(data, selectedPoint, $('before-condition').value, $('after-condition').value);
  const signed = value => `${value >= 0 ? '+' : ''}${n(value)}`;
  $('comparison-result').textContent = compared ? `変更後 − 変更前: ダウンロード ${signed(compared.downloadDelta)} Mbps / アップロード ${signed(compared.uploadDelta)} Mbps / 往復応答 ${signed(compared.latencyDelta)} ms。各条件の最新実測を比較しています。` : '両方の条件で同じ地点を測ると差を表示します。';
}
function traffic() { $('traffic').textContent = `転送量: 合計 ${Number($('transfer-size').value) * Number($('repeats').value) * 2 / 1048576} MiB。往復応答は 7 回測定します。`; }
function exportFile(name, contents, type) {
  const link = document.createElement('a'), url = URL.createObjectURL(new Blob([contents], {type}));
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function decodeImage(image, width, height) {
  const img = new Image(); img.src = image; await img.decode();
  if (!img.naturalWidth || img.naturalWidth > 8192 || img.naturalHeight > 8192 || img.naturalWidth * img.naturalHeight > LIMITS.pixels ||
    (width !== undefined && (img.naturalWidth !== width || img.naturalHeight !== height))) throw new Error('画像の実寸または画素数が不正です');
  return img;
}
function replaceFloorplan(floorplan) {
  if (data.points.length && !window.confirm('間取りを変えると地点と測定記録を消去します。必要な記録は JSON で保存してください。変更しますか？')) return;
  data = validateDataset({...data, floorplan, points:[], measurements:[]}); selectedPoint = ''; render(); message('間取りを設定しました。現在地をタップしてください。');
}
$('map').addEventListener('click', event => {
  if (client.busy) return;
  if (data.points.length >= LIMITS.points) return message('地点数の上限 (500) に達しました。', true);
  const rect = $('map').getBoundingClientRect();
  const x = Math.max(0,Math.min(1,(event.clientX - rect.left) / rect.width));
  const y = Math.max(0,Math.min(1,(event.clientY - rect.top) / rect.height));
  const created = {id:uid('point'),label:`地点 ${data.points.length + 1}`,x,y};
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
  const name = $('condition-name').value.trim(); if (!name) return message('条件名を入力してください。', true);
  if (data.conditions.length >= LIMITS.conditions) return message('条件数の上限 (50) に達しました。',true);
  if (data.conditions.some(c => c.name === name)) return message('同じ名前の条件がすでにあります。',true);
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
  if (data.measurements.length >= LIMITS.measurements) return message('測定件数の上限 (5000) に達しました。',true);
  const pointId = selectedPoint, conditionId = selectedCondition;
  controller = new AbortController(); setBusy(true); message('測定中です。端末を動かさず、画面を開いたままにしてください。');
  try {
    const results = await client.measure({bytes:Number($('transfer-size').value),repeats:Number($('repeats').value),signal:controller.signal,
      onProgress: p => { $('progress-text').textContent = `${phaseNames[p.phase]} ${p.current}/${p.total}`; }});
    if (controller.signal.aborted) throw new Error('測定を中断しました');
    data = appendMeasurement(data,{id:uid('measurement'),pointId,conditionId,timestamp:new Date().toISOString(),...results,device:navigator.userAgent.slice(0,300),mode:'measured'});
    message('測定を記録しました。別の地点や条件でも測って比較できます。');
  } catch (error) {
    message(`測定を記録しませんでした: ${error.message || '通信に失敗しました'}。既存の結果は保持しています。`,true);
  } finally { controller = null; render(); }
});
$('cancel').addEventListener('click', () => controller?.abort(new Error('測定を中断しました')));
document.addEventListener('visibilitychange', () => { if (document.hidden) controller?.abort(new Error('画面が非表示になったため測定を中断しました')); });
$('floorplan-file').addEventListener('change',async () => {
  const file = $('floorplan-file').files[0]; if (!file) return;
  try {
    if (file.size > LIMITS.imageBytes || !['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('PNG/JPEG/WebP、5 MiB 以下の画像を選んでください');
    const image = await new Promise((resolve,reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('画像を読めません')); r.readAsDataURL(file); });
    const img = await decodeImage(image);
    replaceFloorplan({name:file.name.slice(0,200),image,width:img.naturalWidth,height:img.naturalHeight});
  } catch (error) { message(error.message,true); } finally { $('floorplan-file').value = ''; }
});
$('blank-plan').addEventListener('click', () => replaceFloorplan(emptyDataset().floorplan));
$('export-json').addEventListener('click', () => exportFile('roomping.json',toJSON(data),'application/json'));
$('export-csv').addEventListener('click', () => exportFile('roomping.csv','\uFEFF' + toCSV(data),'text/csv;charset=utf-8'));
$('import-json').addEventListener('change',async () => {
  const file = $('import-json').files[0]; if (!file) return;
  try {
    if (file.size > LIMITS.jsonBytes) throw new Error('JSON は 12 MiB 以下にしてください');
    const checked = validateDataset(JSON.parse(await file.text()));
    if (checked.floorplan.image) await decodeImage(checked.floorplan.image,checked.floorplan.width,checked.floorplan.height);
    pendingImport = checked;
    $('import-summary').textContent = `${file.name}: ${checked.points.length} 地点 / ${checked.conditions.length} 条件 / ${checked.measurements.length} 回の実測`;
    $('import-review').hidden = false; $('import-review').scrollIntoView({behavior:'smooth'}); message('読込内容を検証しました。下の確認欄で置き換えを選択してください。');
  } catch (error) { pendingImport = null; $('import-review').hidden = true; message(`JSON を読み込めません: ${error.message}。現在の記録は保持しています。`,true); }
  finally { $('import-json').value = ''; }
});
$('confirm-import').addEventListener('click', () => {
  if (!pendingImport || client.busy) return; data = pendingImport; pendingImport = null;
  selectedPoint = data.points[0]?.id || ''; selectedCondition = data.conditions[0]?.id || ''; $('import-review').hidden = true; render(); message('記録を読み込みました。');
});
$('cancel-import').addEventListener('click', () => { pendingImport = null; $('import-review').hidden = true; });
window.addEventListener('beforeunload',event => { if (data.points.length) { event.preventDefault(); event.returnValue = ''; } });
async function connect() {
  if (!token) { $('connection').textContent = '閲覧のみ'; $('connection').classList.add('offline'); message('参加用トークンがありません。起動時の URL から開き直してください。保存済み JSON の閲覧はできます。',true); return; }
  try {
    const info = await client.request('/api/info'); connected = true;
    $('connection').textContent = 'PC ホストに接続'; $('connection').classList.add('connected');
    $('join-url').textContent = info.joinUrl; $('join-url').href = info.joinUrl;
    const qr = await client.request('/api/qr',{consume:r => r.blob()});
    $('join-qr').src = URL.createObjectURL(qr); $('join-qr').hidden = false;
    message('接続しました。間取りを選ぶか、空白の図で現在地をタップしてください。');
  } catch (error) {
    connected = false; $('connection').textContent = 'ホスト未接続'; $('connection').classList.add('offline');
    message(`PC ホストに接続できません: ${error.message}。ホスト・同じ LAN・ファイアウォールを確認してください。JSON の閲覧はできます。`,true);
  } finally { setBusy(false); }
}
render(); traffic(); connect();
