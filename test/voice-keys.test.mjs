// Each voice.* key is defined once per dictionary.
// PR #42 (https://github.com/kobifrah1991-svg/Drop-Havoc/pull/42) adds these four keys
// to shared/lang/{de,es,fr,id,pt,tr}.js because they already exist once in shared/i18n.js
// and were missing from the extra languages. This branch does not add them again.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PR42_VOICE_KEYS = ['voice.off', 'voice.report', 'voice.block', 'voice.unblock'];

function definitions(source) {
  const counts = new Map();
  const re = /['"](voice\.[A-Za-z0-9_.]+)['"]\s*:/g;
  let m;
  while ((m = re.exec(source))) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  return counts;
}

const files = [
  'shared/i18n.js',
  'shared/lang/de.js',
  'shared/lang/es.js',
  'shared/lang/fr.js',
  'shared/lang/id.js',
  'shared/lang/pt.js',
  'shared/lang/tr.js',
];

test('every voice.* key is defined at most once in each dictionary', () => {
  for (const rel of files) {
    const counts = definitions(fs.readFileSync(path.join(root, rel), 'utf8'));
    for (const [key, n] of counts) assert.equal(n, 1, `${rel} defines ${key} ${n} times`);
    assert.ok(counts.size > 0, rel);
  }
});

test('PR #42 voice keys are not duplicated by this branch', () => {
  const core = definitions(fs.readFileSync(path.join(root, 'shared/i18n.js'), 'utf8'));
  for (const key of PR42_VOICE_KEYS) assert.equal(core.get(key), 1, key);
  for (const rel of files.slice(1)) {
    const counts = definitions(fs.readFileSync(path.join(root, rel), 'utf8'));
    for (const key of PR42_VOICE_KEYS) assert.ok((counts.get(key) || 0) <= 1, `${rel} ${key}`);
  }
});
