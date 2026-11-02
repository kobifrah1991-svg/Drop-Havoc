// 0.16.23: live in-match minimap (HUD). Pure helpers + a 2D-canvas drawer, shared by the client and tests.
// Reuses the map's own bounds and box list (same projection as the 0.16.13 drop-zone picker).
export const MINIMAP_HZ = 12;
export function minimapVisible(s) { // s: {inMatch, paused, alive, parachuting, spectating, hidden}
  if (!s || !s.inMatch || s.paused || s.hidden) return false;
  return !!(s.alive || s.parachuting || s.spectating);
}
export function mapBounds(map) { return (map && (map.bounds || map.boxes?.bounds)) || 31; }
export function project(B, S, x, z) { return [(x + B) / (2 * B) * S, (z + B) / (2 * B) * S]; }
export function unproject(u, v, S, B) { return [(u / S) * 2 * B - B, (v / S) * 2 * B - B]; } // 0.16.27 map pings
export function landmarks(map) { // static boxes worth drawing (tall solids, not floors/vehicles/invisible)
  const B = mapBounds(map), out = [];
  for (const b of map?.boxes || []) { if (b.invisible || b.vehicle || b.max[1] < 1.5 || b.max[0] - b.min[0] > B * 0.9) continue; out.push(b); }
  return out;
}
/** Builds the marker list. me {p,yaw}; enemies [{p}]; cars [{p,yaw,driver}]; zone {c:[x,z],r}|null */
export function minimapMarkers({ map, me, enemies = [], cars = [], zone = null }) {
  const B = mapBounds(map), inB = (p) => p && Math.abs(p[0]) <= B * 1.05 && Math.abs(p[2]) <= B * 1.05, m = [];
  for (const c of cars) if (inB(c.p)) m.push({ type: 'car', x: c.p[0], z: c.p[2], yaw: c.yaw || 0, mine: !!(me && c.driver && c.driver === me.id) });
  for (const e of enemies) if (inB(e.p)) m.push({ type: 'enemy', x: e.p[0], z: e.p[2], color: e.color || null });
  if (zone && zone.r > 0) m.push({ type: 'zone', x: zone.c[0], z: zone.c[1], r: zone.r });
  if (me && me.p) m.push({ type: 'player', x: me.p[0], z: me.p[2], yaw: me.yaw || 0 });
  return { bounds: B, markers: m };
}
export function drawMinimap(ctx, S, map, data, opts = {}) {
  const B = data.bounds, P = (x, z) => project(B, S, x, z), k = S / (2 * B);
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = opts.grey ? 'rgba(60,60,60,.75)' : 'rgba(30,40,30,.78)'; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(160,165,170,.85)';
  for (const b of opts.landmarks || []) { const [x0, z0] = P(b.min[0], b.min[2]); ctx.fillRect(x0, z0, Math.max(1, (b.max[0] - b.min[0]) * k), Math.max(1, (b.max[2] - b.min[2]) * k)); }
  ctx.strokeStyle = '#ffb34d'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, S - 2, S - 2);
  for (const mk of data.markers) {
    const [x, y] = P(mk.x, mk.z);
    if (mk.type === 'zone') { ctx.strokeStyle = '#3cf'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, mk.r * k, 0, 7); ctx.stroke(); }
    else if (mk.type === 'car') { ctx.save(); ctx.translate(x, y); ctx.rotate(-mk.yaw); ctx.fillStyle = mk.mine ? '#7cff6b' : '#4da3ff'; ctx.fillRect(-2.5, -4, 5, 8); ctx.restore(); }
    else if (mk.type === 'enemy') { ctx.fillStyle = mk.color || '#ff3b4a'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
  }
  const pl = data.markers.find((m) => m.type === 'player');
  if (pl) { const [x, y] = P(pl.x, pl.z); ctx.save(); ctx.translate(x, y); ctx.rotate(-pl.yaw); // game forward is -Z = up on the map
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
}
