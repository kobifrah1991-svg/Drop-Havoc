import { rayWorld, stanceOf } from './physics.js';
// PUBG-style ground loot. There are no crates to open: at the start of every match the old crate spots
// (map.chests) and the house floor spots (map.floorLoot) are filled with items lying on the floor:
// weapons, helmets and vests (levels 1-3), medical items, energy drinks and ammo. Rare spots (high ground,
// upper floors) roll better gear. Walking over an item or pressing E picks it up; the server checks range,
// line of sight and that each item is taken once.
// The module keeps its old name and API (open/pickup/reset/state/dropState) so the rest of the game and the
// network protocol do not change: state() is now always empty and open() always refuses.
const pickW = (table, r) => { let s = 0; for (const [, w] of table) s += w; let x = r * s; for (const [v, w] of table) { x -= w; if (x <= 0) return v; } return table[table.length - 1][0]; };
const LEVELS = [[1, 55], [2, 33], [3, 12]], RARE_LEVELS = [[2, 60], [3, 40]];
const GUNS = [['rifle', 22], ['smg', 20], ['pistol', 18], ['shotgun', 14], ['m4', 12], ['m16', 8], ['sniper', 6]];
const RARE_GUNS = [['m4', 30], ['m16', 25], ['sniper', 25], ['shotgun', 20]];
const HEALS = [['bandage', 55], ['firstaid', 33], ['medkit', 12]];
const KINDS = [['weapon', 26], ['armor', 14], ['helmet', 14], ['heal', 22], ['drink', 10], ['ammo', 14]];
export function rollLoot(rare, random = Math.random) {
  const kind = pickW(KINDS, random());
  if (kind === 'weapon') return { kind, loot: { weapon: pickW(rare ? RARE_GUNS : GUNS, random()) } };
  if (kind === 'armor') return { kind, loot: { vest: pickW(rare ? RARE_LEVELS : LEVELS, random()) } };
  if (kind === 'helmet') return { kind, loot: { helmetLvl: pickW(rare ? RARE_LEVELS : LEVELS, random()) } };
  if (kind === 'heal') return { kind, loot: { heal: pickW(HEALS, random()) } };
  if (kind === 'drink') return { kind, loot: { drink: 1 } };
  return { kind, loot: { ammo: 1 } };
}
export function createChests(map, { broadcast, send, reward, grantEquipment, random = Math.random }) {
  const solid = Object.assign(map.boxes.filter((b) => !b.chest), { ramps: map.boxes.ramps, pads: map.boxes.pads });
  // Loot spots: former crate spots (rare ones roll two items, the second being gear) and floor spots
  const spots = [...(map.chests || []).map((c) => ({ p: c.p, rare: !!c.rare, n: c.rare ? 2 : 1, chance: 1 })),
    ...(map.floorLoot || []).map((f) => ({ p: f.p, rare: !!f.rare, n: 1, chance: f.chance ?? 0.7 }))];
  let drops = [];
  const dropState = () => drops.filter((d) => !d.taken).map(({ id, p, kind, loot, origin }) => ({ id, p, kind, loot, origin }));
  const state = () => [];
  function seed() {
    drops = [];
    spots.forEach((s, i) => {
      if (random() > s.chance) return;
      for (let k = 0; k < s.n; k++) {
        let item = rollLoot(s.rare, random);
        if (k === 1 && item.kind !== 'armor' && item.kind !== 'helmet') {
          const lvl = pickW(RARE_LEVELS, random());
          item = random() < 0.5 ? { kind: 'armor', loot: { vest: lvl } } : { kind: 'helmet', loot: { helmetLvl: lvl } };
        }
        // Two items on one spot sit side by side, inside the old crate footprint
        const p = [s.p[0] + (s.n > 1 ? (k ? 0.35 : -0.35) : 0), s.p[1], s.p[2]];
        drops.push({ id: `loot-${i}-${k}`, p, origin: p, kind: item.kind, loot: item.loot, taken: false });
      }
    });
  }
  seed();
  function open() { return false; } // no crates any more
  function pickup(player, id) {
    const item = drops.find((d) => d.id === id && !d.taken);
    if (!player?.alive || !item || Math.hypot(...player.p.map((n, i) => n - item.p[i])) > 2.6) return false;
    const eye = [player.p[0], player.p[1] + stanceOf(player.stance).eye, player.p[2]], target = [item.p[0], item.p[1] + 0.3, item.p[2]], distance = Math.hypot(...target.map((n, i) => n - eye[i]));
    if (distance > 1.9 && rayWorld(eye, target.map((n, i) => (n - eye[i]) / distance), solid, distance) < distance - 0.05) return false;
    // The item stays if it would do nothing (full health and a bandage, a weaker vest than yours)
    if (grantEquipment(player, item.loot) === false) return false;
    item.taken = true;
    if (item.kind === 'credits') reward?.(player, item.loot);
    send(player, { t: 'chestReward', kind: item.kind, ...item.loot });
    // Only the change goes out: one id instead of the whole loot list
    broadcast({ t: 'chests', taken: id });
    return true;
  }
  function reset() { seed(); broadcast({ t: 'chests', chests: [], drops: dropState() }); }
  return { state, open, pickup, dropState, reset };
}
