// 0.16.51 Live events: something to go for besides the next fight, in every mode (single player with bots, online,
// free roam). Roughly every 1.5 minutes one event starts, announced to everyone:
//   supply   - a crate parachutes down somewhere open; the first one to reach it gets rare gear and cash
//   bounty   - the player with the most kills (bots too) becomes MOST WANTED; whoever takes them down earns a bounty
//   delivery - (maps with cars) a marked parked car must be driven to a marker across the map before the time runs out
// The match decides everything (positions, who won); clients only draw the banner, markers and the falling crate.
export const EVENT = {
  firstMs: 35000, gapMs: [70000, 110000],
  supply: { cash: 300, ttlMs: 90000, fallMs: 12000, reach: 1.8 },
  bounty: { cash: 500, ttlMs: 120000, minPlayers: 3 },
  delivery: { cash: 600, ttlMs: 110000, reach: 7, minDist: 110 },
};

export function createEvents({ map, players, vehicles, send, broadcast, grant, award, rnd = Math.random, now: clock = Date.now }) {
  let active = null, nextAt = clock() + EVENT.firstMs, seq = 0;
  const alive = () => [...players.values()].filter((p) => p.alive);
  const ground = (map.waypoints || []).filter((w) => (w[1] || 0) < 0.5);
  const far = (pt, from, d) => from.every((p) => Math.hypot(p.p[0] - pt[0], p.p[2] - pt[2]) > d);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  function startSupply(t) {
    const spots = ground.filter((w) => far(w, alive(), 35));
    const w = pick(spots.length ? spots : ground); if (!w) return null;
    return { type: 'supply', id: ++seq, p: [w[0], 0, w[2]], landAt: t + EVENT.supply.fallMs, ends: t + EVENT.supply.ttlMs };
  }
  function startBounty(t) {
    const list = alive(); if (list.length < EVENT.bounty.minPlayers) return null;
    const top = list.reduce((a, b) => ((b.kills || 0) > (a.kills || 0) ? b : a));
    return { type: 'bounty', id: ++seq, target: top.id, name: top.name, ends: t + EVENT.bounty.ttlMs };
  }
  function startDelivery(t) {
    const cars = (vehicles?._cars || []).filter((c) => !c.driver && !c.wrecked && !c.owner);
    const car = pick(cars); if (!car || !ground.length) return null;
    const dests = ground.filter((w) => Math.hypot(w[0] - car.p[0], w[2] - car.p[2]) > EVENT.delivery.minDist);
    const d = pick(dests.length ? dests : ground);
    return { type: 'delivery', id: ++seq, car: car.id, dest: [d[0], 0, d[2]], ends: t + EVENT.delivery.ttlMs };
  }
  function view() {
    if (!active) return null;
    const v = { type: active.type, id: active.id, ends: active.ends };
    if (active.type === 'supply') Object.assign(v, { p: active.p, landAt: active.landAt });
    if (active.type === 'bounty') { const q = players.get(active.target); Object.assign(v, { target: active.target, name: active.name, p: q?.p ? [q.p[0], q.p[1], q.p[2]] : null }); }
    if (active.type === 'delivery') { const c = vehicles?._cars?.find((x) => x.id === active.car); Object.assign(v, { car: active.car, dest: active.dest, p: c ? [c.p[0], 0, c.p[2]] : null }); }
    return v;
  }
  function finish(winner, how) {
    const ev = active; active = null; nextAt = clock() + EVENT.gapMs[0] + rnd() * (EVENT.gapMs[1] - EVENT.gapMs[0]);
    const cash = winner ? EVENT[ev.type].cash : 0;
    if (winner) { winner.cash = Math.min(9999, (winner.cash || 0) + cash); award?.(winner, ev.type); }
    broadcast({ t: 'event', end: true, type: ev.type, id: ev.id, winner: winner?.id || null, name: winner?.name || null, cash, how });
  }
  let lastPush = 0;
  return {
    view,
    tick() {
      const t = clock();
      if (!active) {
        if (t < nextAt) return;
        const order = [startSupply, startBounty, startDelivery].sort(() => rnd() - 0.5);
        for (const f of order) { active = f(t); if (active) break; }
        if (!active) { nextAt = t + 15000; return; }
        broadcast({ t: 'event', start: true, ...view() }); lastPush = t; return;
      }
      if (t > active.ends) { finish(null, 'expired'); return; }
      if (active.type === 'supply' && t >= active.landAt) {
        const w = alive().find((p) => !p.vehicle && Math.hypot(p.p[0] - active.p[0], p.p[2] - active.p[2]) < EVENT.supply.reach && Math.abs(p.p[1] - active.p[1]) < 2);
        if (w) { grant?.(w); finish(w, 'crate'); return; }
      }
      if (active.type === 'bounty' && !players.get(active.target)) { finish(null, 'left'); return; }
      if (active.type === 'delivery') {
        const c = vehicles?._cars?.find((x) => x.id === active.car);
        if (!c || c.wrecked) { finish(null, 'wrecked'); return; }
        if (c.driver && Math.hypot(c.p[0] - active.dest[0], c.p[2] - active.dest[2]) < EVENT.delivery.reach) { finish(players.get(c.driver), 'delivered'); return; }
      }
      if (active && active.type !== 'supply' && t - lastPush > 500) { lastPush = t; broadcast({ t: 'event', update: true, ...view() }); } // moving targets
    },
    // a kill may settle the bounty (the wanted one taken down by someone else)
    onKill(killer, victim) { if (active?.type === 'bounty' && victim?.id === active.target && killer && killer !== victim) finish(killer, 'bounty'); },
    reset() { active = null; nextAt = clock() + EVENT.firstMs; },
    get _cars() { return vehicles?._cars || []; },
    _force(type) { const f = { supply: startSupply, bounty: startBounty, delivery: startDelivery }[type]; active = f?.(clock()) || null; if (active) broadcast({ t: 'event', start: true, ...view() }); return active; },
  };
}
