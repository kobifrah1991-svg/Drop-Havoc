// Standing room shared by the small-map layouts.
// A passage is the clear gap between two ground-level walls. It has to be at least 1.25x the player's
// collision width (diameter). Anything narrower is sealed, because a body that can touch both sides wedges.
// A prop floats when its bottom is above the ground and nothing solid reaches up under it.
import { PLAYER } from './physics.js';

export const PLAYER_WIDTH = PLAYER.radius * 2;
export const MIN_PASSAGE = PLAYER_WIDTH * 1.25;

function overlap(a, b, axis) {
  return Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]);
}

function groundGap(a, b) {
  if (a.max[1] < 0.7 || b.max[1] < 0.7) return null;
  if (a.min[1] > 0.5 || b.min[1] > 0.5) return null;
  if (Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]) < 0.7) return null;
  for (const axis of [0, 2]) {
    const other = axis === 0 ? 2 : 0;
    const across = overlap(a, b, other);
    if (across < 0.25) continue;
    const gap = Math.max(a.min[axis], b.min[axis]) - Math.min(a.max[axis], b.max[axis]);
    if (gap > 0.02) return { axis, gap, across };
  }
  return null;
}

export function narrowPassages(boxes, min = MIN_PASSAGE) {
  const found = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const g = groundGap(boxes[i], boxes[j]);
      if (g && g.gap < min - 1e-6) found.push(g);
    }
  }
  return found;
}

function isFrame(box, bounds) {
  const w = box.max[0] - box.min[0], d = box.max[2] - box.min[2];
  return (w >= bounds * 1.6 && d <= 1.2) || (d >= bounds * 1.6 && w <= 1.2);
}

// Close gaps a player cannot walk through cleanly. Designed doorways are cut wider than MIN_PASSAGE first,
// so this only pulls accidental cracks shut (stairs off a wall, two cover pieces too close).
export function sealNarrowGaps(boxes, bounds, min = MIN_PASSAGE) {
  const area = (b) => Math.max(0, b.max[0] - b.min[0]) * Math.max(0, b.max[2] - b.min[2]);
  for (let pass = 0; pass < 16; pass++) {
    let changed = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const g = groundGap(a, b);
        if (!g || g.gap >= min - 1e-6) continue;
        const axis = g.axis;
        const left = a.max[axis] <= b.min[axis] ? a : b;
        const right = left === a ? b : a;
        const leftFrame = isFrame(left, bounds), rightFrame = isFrame(right, bounds);
        if (leftFrame && rightFrame) continue;
        const moveLeft = !leftFrame && (rightFrame || area(left) <= area(right));
        if (moveLeft) left.max[axis] = right.min[axis];
        else right.min[axis] = left.max[axis];
        const mover = moveLeft ? left : right;
        const limit = bounds - 1;
        if (mover.min[axis] < -limit) mover.min[axis] = -limit;
        if (mover.max[axis] > limit) mover.max[axis] = limit;
        if (mover.max[axis] < mover.min[axis]) mover.max[axis] = mover.min[axis];
        changed = true;
      }
    }
    if (!changed) break;
  }
  return boxes;
}

function footprintHits(a, b) {
  return overlap(a, b, 0) > 0.05 && overlap(a, b, 2) > 0.05;
}

function restsOn(box, support) {
  return footprintHits(box, support) && support.max[1] >= box.min[1] - 0.05 && support.min[1] <= box.min[1] + 0.02;
}

export function floatingProps(boxes, ramps = []) {
  const grounded = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const b of boxes) {
      if (grounded.has(b)) continue;
      if (b.min[1] <= 0.05) { grounded.add(b); changed = true; continue; }
      for (const o of boxes) {
        if (o !== b && grounded.has(o) && restsOn(b, o)) { grounded.add(b); changed = true; break; }
      }
      if (grounded.has(b)) continue;
      for (const r of ramps) {
        if (footprintHits(b, r) && r.min[1] <= b.min[1] + 0.02 && r.max[1] >= b.min[1] - 0.05) {
          grounded.add(b); changed = true; break;
        }
      }
    }
  }
  return boxes.filter((b) => !grounded.has(b));
}
