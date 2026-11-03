import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('0.16.28 APK build bundles icons and img', () => {
  const b = fs.readFileSync(new URL('../android/build.sh', import.meta.url), 'utf8');
  assert.match(b, /cp -r \.\.\/public\/icons "\$OUT\/assets\/www\/icons"/);
  assert.match(b, /cp -r \.\.\/public\/img "\$OUT\/assets\/www\/img"/);
});
test('0.16.28 menu logo uses PNG', () => {
  const h = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(h, /img\/scitedra-games-mark-dh\.png" alt="Scitedra Games"/);
  assert.ok(fs.existsSync(new URL('../public/img/scitedra-games-mark-dh.png', import.meta.url)));
});
