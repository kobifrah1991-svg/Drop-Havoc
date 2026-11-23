import test from 'node:test';
import assert from 'node:assert/strict';
import { CANYON_MAP, HARBOR_MAP } from '../shared/maps-new.js';
import { JUNGLE_MAP, ROOFTOP_MAP, BASE_MAP, SNOW_MAP, FACTORY_MAP, TOWN_MAP } from '../shared/maps-more.js';
import { MIN_PASSAGE, PLAYER_WIDTH, narrowPassages, floatingProps, sealNarrowGaps } from '../shared/map-clearance.js';
import { collides } from '../shared/physics.js';

const MAPS = [CANYON_MAP, HARBOR_MAP, JUNGLE_MAP, ROOFTOP_MAP, BASE_MAP, SNOW_MAP, FACTORY_MAP, TOWN_MAP];

test('player passage minimum is 1.25x the collision width', () => {
  assert.equal(PLAYER_WIDTH, 0.8);
  assert.equal(MIN_PASSAGE, 1);
});

test('small maps: every ground passage is wide enough and nothing floats', () => {
  for (const m of MAPS) {
    assert.equal(narrowPassages(m.boxes).length, 0, m.id + ' has a passage under ' + MIN_PASSAGE + ' m');
    assert.equal(floatingProps(m.boxes, m.ramps).length, 0, m.id + ' has a floating prop');
    for (const s of m.spawns) assert.equal(collides(s[0], (s[1] || 0) + 0.05, s[2], m.boxes), null, m.id + ' spawn');
  }
});

test('maps-more houses keep a doorway at least 1.25x the player width', () => {
  for (const m of [JUNGLE_MAP, ROOFTOP_MAP, BASE_MAP, SNOW_MAP, FACTORY_MAP, TOWN_MAP]) {
    const doors = groundGaps(m.boxes).filter((g) => g >= MIN_PASSAGE && g < MIN_PASSAGE + 0.25);
    assert.ok(doors.length >= 2, m.id + ' door gaps ' + doors.join(','));
  }
});

test('sealNarrowGaps closes a crack and leaves a legal doorway', () => {
  const boxes = [
    { min: [0, 0, 0], max: [1, 2, 4] },
    { min: [1.4, 0, 0], max: [3, 2, 4] },
    { min: [10, 0, 0], max: [11, 2, 4] },
    { min: [12.2, 0, 0], max: [14, 2, 4] },
  ];
  sealNarrowGaps(boxes, 40);
  assert.equal(narrowPassages(boxes).length, 0);
  const wide = groundGaps(boxes).find((g) => g >= MIN_PASSAGE);
  assert.ok(wide >= MIN_PASSAGE);
});

function groundGaps(boxes) {
  const out = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.max[1] < 0.7 || b.max[1] < 0.7 || a.min[1] > 0.5 || b.min[1] > 0.5) continue;
      if (Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]) < 0.7) continue;
      for (const axis of [0, 2]) {
        const other = axis === 0 ? 2 : 0;
        const across = Math.min(a.max[other], b.max[other]) - Math.max(a.min[other], b.min[other]);
        if (across < 0.25) continue;
        const gap = Math.max(a.min[axis], b.min[axis]) - Math.min(a.max[axis], b.max[axis]);
        if (gap > 0.02) out.push(gap);
      }
    }
  }
  return out;
}
