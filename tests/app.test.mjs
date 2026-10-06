/** Real app event handlers on a minimal DOM fixture; not a browser/download test. */
import test from 'node:test';
import assert from 'node:assert/strict';

class Element {
  constructor(tag = 'div') {
    this.tag = tag; this.value = ''; this.children = []; this.listeners = new Map();
    this.style = {}; this.classList = {toggle() {}, add() {}};
  }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  async dispatch(name) { return this.listeners.get(name)?.({}); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  removeAttribute() {}
  scrollIntoView() {}
  remove() {}
}
let instance = 0;
async function app(t, search = '?lang=ja') {
  const originals = new Map(['document','window','location'].map(k => [k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const elements = new Map(), downloads = [];
  const get = id => { if (!elements.has(id)) elements.set(id,new Element()); return elements.get(id); };
  get('transfer-size').value = '4194304'; get('repeats').value = '3';
  globalThis.document = {getElementById:get, body:new Element(), documentElement:new Element('html'), addEventListener() {},
    querySelectorAll() { return []; },
    createElement(tag) { const element = new Element(tag); if (tag === 'a') element.click = () => downloads.push(element); return element; }};
  globalThis.window = {addEventListener() {}, confirm:() => true};
  globalThis.location = {hash:'', search};
  t.after(() => {
    for (const [key,descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key];
    }
    for (const link of downloads) URL.revokeObjectURL(link.href);
  });
  await import(`../src/roomping/static/app.js?fixture=${++instance}`);
  return {get,downloads};
}
function dataset(nearCapacity = false) {
  const durationMs = 123.456789, sample = {bytes:16777216,durationMs};
  return {version:1,floorplan:{name:'空白',image:null,width:1000,height:700},
    points:[{id:'p1',label:'窓際',x:.25,y:.75}],conditions:[{id:'c1',name:'移動前',notes:'PC有線'}],
    measurements:Array.from({length:5000},(_,i)=>({id:`m${i}`,pointId:'p1',conditionId:'c1',timestamp:'2026-10-03T00:00:00.000Z',
      latencyMs:Array(20).fill(durationMs),download:Array(20).fill(sample),upload:Array(20).fill(sample),
      device:nearCapacity && i<2012 ? '📶'.repeat(150) : 'x'.repeat(300),mode:'measured'}))};
}
async function importData(ui,data) {
  const raw = JSON.stringify(data);
  assert.ok(Buffer.byteLength(raw) <= 12582912);
  ui.get('import-json').files = [{name:'fixture.json',size:Buffer.byteLength(raw),text:async()=>raw}];
  await ui.get('import-json').dispatch('change');
  assert.equal(ui.get('import-review').hidden,false);
  await ui.get('confirm-import').dispatch('click');
}
async function exportData(ui) {
  await ui.get('export-json').dispatch('click');
  const link=ui.downloads.at(-1);
  assert.equal(link.download,'roomping.json');
  return await (await fetch(link.href)).text();
}
test('?lang=en renders the interface and new data in English', async t => {
  const ui=await app(t,'?lang=en');
  assert.equal(ui.get('lang').textContent,'日本語');
  assert.equal(ui.get('point-count').textContent,'0 spots');
  assert.match(ui.get('traffic').textContent,/^Traffic: 24 MiB in total/);
  assert.equal(ui.get('condition-select').children[0].textContent,'Before moving the router');
  ui.get('condition-name').value='';
  await ui.get('add-condition').dispatch('click');
  assert.equal(ui.get('status').textContent,'Enter a condition name.');
});
test('the language toggle redraws the current message', async t => {
  const ui=await app(t,'?lang=en');
  await ui.get('add-condition').dispatch('click');
  await ui.get('lang').dispatch('click');
  assert.equal(ui.get('status').textContent,'条件名を入力してください。');
  assert.equal(ui.get('lang').textContent,'English');
  assert.equal(ui.get('point-count').textContent,'0 地点');
});
test('adding a second condition compares against it instead of the same condition', async t => {
  const ui=await app(t);
  const before=ui.get('before-condition').value;
  assert.equal(ui.get('after-condition').value,before);
  ui.get('condition-name').value='中継機を追加';
  await ui.get('add-condition').dispatch('click');
  assert.equal(ui.get('before-condition').value,before);
  assert.equal(ui.get('after-condition').value,ui.get('condition-select').value);
  assert.notEqual(ui.get('after-condition').value,before);
});
test('JSON save handler generates a lossless file inside the import limit', async t => {
  const ui=await app(t), data=dataset();
  await importData(ui,data);
  const raw=await exportData(ui);
  assert.ok(Buffer.byteLength(raw) <= 12582912);
  assert.deepEqual(JSON.parse(raw),data);
});
test('capacity-rejected point edit restores the field and keeps exportable records', async t => {
  const ui=await app(t), data=dataset(true);
  await importData(ui,data);
  ui.get('point-name').value='漢'.repeat(80);
  await assert.doesNotReject(ui.get('point-name').dispatch('change'));
  assert.equal(ui.get('point-name').value,'窓際');
  assert.match(ui.get('status').textContent,/12 MiB.*保持/);
  assert.deepEqual(JSON.parse(await exportData(ui)),data);
});
test('successful edit after a capacity refusal clears the stale error message', async t => {
  const ui=await app(t), data=dataset(true);
  await importData(ui,data);
  ui.get('point-name').value='漢'.repeat(80);
  await ui.get('point-name').dispatch('change');
  assert.match(ui.get('status').textContent,/12 MiB/);
  ui.get('point-name').value='A';
  await ui.get('point-name').dispatch('change');
  assert.doesNotMatch(ui.get('status').textContent,/12 MiB/);
  assert.deepEqual(JSON.parse(await exportData(ui)),{...data,points:[{...data.points[0],label:'A'}]});
});
