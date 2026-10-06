/** Interface text: both languages complete, every used key defined, language choice predictable. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TEXT, getLanguage, pickLanguage, setLanguage, t} from '../src/roomping/static/i18n.mjs';

const read = name => readFileSync(new URL(`../src/roomping/static/${name}`, import.meta.url), 'utf8');
const JAPANESE = /[぀-ヿ一-鿿]/;

test('Japanese and English define the same keys, none empty', () => {
  assert.deepEqual(Object.keys(TEXT.ja).sort(), Object.keys(TEXT.en).sort());
  for (const lang of ['ja', 'en']) for (const [key, value] of Object.entries(TEXT[lang])) assert.ok(value.trim(), `${lang}.${key}`);
  // The English page's toggle names the other language in its own script.
  for (const [key, value] of Object.entries(TEXT.en)) if (key !== 'switch_language') assert.doesNotMatch(value, JAPANESE, `en.${key}`);
});

test('every key used by the page and modules exists', () => {
  const used = new Set();
  for (const name of ['app.js', 'metrics.mjs', 'measurement.mjs']) {
    for (const [, key] of read(name).matchAll(/\bt\('([a-z0-9_]+)'/g)) used.add(key);
    for (const [, key] of read(name).matchAll(/message\('([a-z0-9_]+)'/g)) used.add(key);
  }
  for (const phase of ['warmup', 'latency', 'download', 'upload']) used.add(`phase_${phase}`);
  const html = read('index.html');
  for (const [, key] of html.matchAll(/data-i18n="([^"]+)"/g)) used.add(key);
  for (const [, pairs] of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of pairs.split(';')) used.add(pair.split(':')[1]);
  assert.ok(used.size > 50);
  assert.deepEqual([...used].filter(key => !(key in TEXT.en)), []);
});

test('no untranslated Japanese remains in scripts', () => {
  for (const name of ['app.js', 'metrics.mjs', 'measurement.mjs']) assert.doesNotMatch(read(name), JAPANESE, name);
});

test('language: query, then saved choice, then first ja/en browser language, else English', () => {
  assert.equal(pickLanguage({search: '?lang=en', saved: 'ja', languages: ['ja-JP']}), 'en');
  assert.equal(pickLanguage({search: '?lang=xx', saved: 'ja', languages: ['en-US']}), 'ja');
  assert.equal(pickLanguage({languages: ['ja-JP', 'en-US']}), 'ja');
  assert.equal(pickLanguage({languages: ['en-GB', 'ja']}), 'en');
  assert.equal(pickLanguage({languages: ['fr-FR', 'ja']}), 'ja');
  assert.equal(pickLanguage({languages: ['de-DE']}), 'en');
  assert.equal(pickLanguage(), 'en');
});

test('t() fills parameters in the selected language', () => {
  setLanguage('ja');
  assert.equal(t('spot_count', {n: 3}), '3 地点');
  setLanguage('en');
  assert.equal(getLanguage(), 'en');
  assert.equal(t('spot_count', {n: 3}), '3 spots');
  assert.equal(t('m_http', {status: 409, error: 'busy'}), 'HTTP 409: busy');
});
