// HUD overlap check for phones: plays offline practice on an emulated phone and lists every pair of visible HUD
// elements whose boxes overlap. Needs the game server running: PORT=4392 node server.js
// Usage: node tools/hud-overlap.cjs <out-dir> "iPhone SE landscape" jungle
// Plays a few seconds on an emulated phone and lists every pair of visible HUD elements whose boxes overlap.
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [dev, map] of [[process.argv[3] || 'Pixel 7 landscape', process.argv[4] || 'jungle']]) {
    // "desktop 1366x768" checks a computer screen (mouse, no touch HUD); anything else is a Playwright device name
    const dm = /^desktop (\d+)x(\d+)$/.exec(dev);
    const ctx = await b.newContext(dm ? { viewport: { width: +dm[1], height: +dm[2] } } : { ...devices[dev] });
    await ctx.addInitScript((m) => { localStorage.setItem('arena.gfx', '"low"'); localStorage.setItem('arena.map', JSON.stringify(m)); localStorage.setItem('arena.gate', '"guest"'); localStorage.setItem('arena.lang', '"he"'); sessionStorage.setItem('arena.splash', '1'); }, map);
    const pg = await ctx.newPage();
    await pg.goto('http://localhost:4392/', { waitUntil: 'domcontentloaded', timeout: 120000 }); await pg.waitForTimeout(6000);
    await pg.click('.st-card-solo'); await pg.waitForTimeout(800); await pg.click('.st-solo-play'); await pg.waitForTimeout(9000);
    const drop = pg.getByText(/🪂/); if (await drop.count()) { await drop.first().click().catch(() => {}); await pg.waitForTimeout(6000); }
    // fake a few HUD states that appear in real play
    await pg.evaluate(() => { const ld = document.getElementById('leader'); if (ld) ld.textContent = 'מוביל/ה: kobi (0/25)'; const s = document.getElementById('streak'); if (s) { s.textContent = '7 STREAK'; s.classList.remove('hidden'); s.style.opacity = 1; } const bf = document.getElementById('buffs'); if (bf) bf.innerHTML = '<span class="buff">⚡ 5s</span><span class="buff">💥 9s</span>'; const kf = document.getElementById('killfeed'); if (kf) kf.innerHTML = '<div>Blitz ➜ Neon</div><div>Turbo ➜ Pixel</div><div>You ➜ Blitz</div>'; const rc = document.getElementById('room-code'); if (rc) { rc.classList.remove('hidden'); rc.textContent = 'לחץ להזמנה · קוד חדר: PTC9P'; } const dp = document.getElementById('daily-panel'); if (dp) dp.classList.remove('hidden'); document.getElementById('t-car')?.removeAttribute('hidden'); const ch = document.getElementById('cash-hud'); if (ch) { ch.hidden = false; ch.textContent = '💵 $1250'; } const st = document.createElement('style'); st.textContent = '#cash-hud{display:block!important}'; document.head.appendChild(st); });
    await pg.waitForTimeout(500);
    const res = await pg.evaluate(() => {
      const ids = ['hp-text', 'hp-bar', 'armor', 'weapon-slots', 'switch-hint', 'topbar', 'timer', 'leader', 'killfeed', 'health', 'ammo', 'weapon-name', 'mag', 'buffs', 'streak', 'room-code', 'daily-panel', 'minimap', 'minimap-toggle', 'ping-hud', 'alti', 'passive-btn', 'loot-interact', 'scoreboard-toggle', 'voice-hud', 'cash-hud'];
      const els = [...ids.map((id) => document.getElementById(id)), ...document.querySelectorAll('#touch .tbtn')].filter(Boolean);
      const boxes = els.map((e) => ({ id: e.id || e.className, r: e.getBoundingClientRect(), vis: getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && !e.hidden && !e.closest('.hidden') && e.getBoundingClientRect().width > 2 && (e.textContent.trim() || e.querySelector('img,canvas') || e.id === 'minimap') }))
        .filter((x) => x.vis);
      const out = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], c = boxes[j];
        if (a.id && c.id && (document.getElementById(a.id)?.contains(document.getElementById(c.id)) || document.getElementById(c.id)?.contains(document.getElementById(a.id)))) continue;
        const ox = Math.min(a.r.right, c.r.right) - Math.max(a.r.left, c.r.left), oy = Math.min(a.r.bottom, c.r.bottom) - Math.max(a.r.top, c.r.top);
        if (ox > 2 && oy > 2) out.push(`${a.id} x ${c.id} (${Math.round(ox)}x${Math.round(oy)})`);
      }
      return { size: [innerWidth, innerHeight], boxes: boxes.map((x) => `${x.id}:${Math.round(x.r.left)},${Math.round(x.r.top)},${Math.round(x.r.width)}x${Math.round(x.r.height)}`), out };
    });
    console.log(JSON.stringify(res, null, 1));
    await pg.screenshot({ path: `${process.argv[2]}/hud-check.png`, timeout: 120000 });
    await ctx.close();
  }
  await b.close();
})();
