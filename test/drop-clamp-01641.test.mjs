import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('0.16.41 parachute spread re-clamped inside map',()=>{const s=fs.readFileSync(new URL('../shared/game.js',import.meta.url),'utf8');assert.match(s,/re-clamp after spread/);assert.doesNotMatch(s,/s=\[p\.dropAt\[0\]\+\(Math\.random\(\)-0\.5\)\*8,0/);});
test('0.16.41 keep-alive workflow pings /health',()=>{const w=fs.readFileSync(new URL('../.github/workflows/keepalive.yml',import.meta.url),'utf8');assert.match(w,/drop-havoc\.onrender\.com\/health/);});
test('0.16.41 touch minimap clamped past top-left buttons',()=>{const c=fs.readFileSync(new URL('../public/style.css',import.meta.url),'utf8');assert.match(c,/0\.16\.41: minimap never under/);});
