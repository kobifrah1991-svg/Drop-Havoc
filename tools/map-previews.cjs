// Renders the map preview pictures for the map picker (public/img/maps/<id>.jpg) from the real game.
// Needs the game server running locally: PORT=4391 BOTS=6 node server.js, then: node tools/map-previews.cjs
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, '..', 'public', 'img', 'maps');
// Camera per map: a high three-quarter view over the action (positions in metres)
const SHOTS = {
  city: { pos: [96, 52, 104], look: [0, 0, 0], fov: 55 },
  neon: { pos: [24, 16, 26], look: [0, 1, 0] },
  canyon: { pos: [34, 20, 36], look: [0, 2, 0] },
  harbor: { pos: [30, 18, 32], look: [0, 1, 0] },
  jungle: { pos: [28, 17, 30], look: [0, 1, 0] },
  rooftop: { pos: [27, 22, 29], look: [0, 3, 0] },
  base: { pos: [32, 18, 34], look: [0, 1, 0] },
  snow: { pos: [28, 16, 30], look: [0, 1, 0] },
  factory: { pos: [24, 15, 26], look: [0, 1, 0] },
  town: { pos: [30, 18, 32], look: [0, 1, 0] },
};
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [id, shot] of Object.entries(process.argv[2] ? { [process.argv[2]]: SHOTS[process.argv[2]] } : SHOTS)) {
    const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
    await ctx.addInitScript(([m]) => { localStorage.setItem('arena.map', JSON.stringify(m)); localStorage.setItem('arena.gfx', '"high"'); localStorage.setItem('arena.time', '"day"'); }, [id]);
    const pg = await ctx.newPage();
    await pg.goto('http://localhost:4391/?debug'); await pg.waitForTimeout(1500);
    if (await pg.isVisible('#gate-enter')) await pg.click('#gate-enter');
    await pg.waitForTimeout(500); await pg.click('#play'); await pg.waitForTimeout(3000);
    const drop = pg.getByText('Drop!'); if (await drop.count()) await drop.first().click().catch(() => {});
    await pg.waitForTimeout(2000);
    await pg.evaluate((s) => { window.arenaDebug.photoCam = s; const st = document.createElement('style'); st.textContent = 'body > *:not(canvas) { visibility: hidden !important; } #game { filter: none !important; }'; document.head.append(st); }, shot);
    await pg.waitForTimeout(14000); // textures, sky and bots settle
    await pg.screenshot({ path: path.join(OUT, id + '.jpg'), type: 'jpeg', quality: 82, timeout: 400000 });
    console.log('saved', id);
    await ctx.close();
  }
  await b.close();
})();
