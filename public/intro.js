// Entry experience (web and the Android app alike):
// 1. Opening screen once per launch: the studio mark, then the DROP HAVOC title with a light sweep and a loading
//    bar; it fades out on its own after ~2.5 s (a tap skips it).
// 2. A cinematic backdrop behind the sign-in and the main menu: real pictures of the game's maps (img/maps/*.jpg)
//    drifting slowly (Ken Burns) and cross-fading, with warm light, a vignette and floating embers.
// 3. On phones held sideways the sign-in card splits into two columns (brand left, choices right) so it fits
//    without scrolling.
const SHOTS = ['city', 'neon', 'canyon', 'harbor', 'town', 'base', 'snow', 'rooftop', 'jungle', 'factory'];

export function createIntro() {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- cinematic backdrop ----------
  const cine = document.createElement('div');
  cine.id = 'cine'; cine.setAttribute('aria-hidden', 'true');
  cine.innerHTML = '<div class="cine-shot a"></div><div class="cine-shot b"></div><div class="cine-tint"></div><div class="cine-embers"></div><div class="cine-vignette"></div>';
  document.body.prepend(cine);
  const embers = cine.querySelector('.cine-embers');
  for (let i = 0; i < 22; i++) {
    const e = document.createElement('i');
    e.style.left = Math.random() * 100 + '%'; e.style.animationDelay = -Math.random() * 14 + 's';
    e.style.animationDuration = 9 + Math.random() * 9 + 's'; e.style.setProperty('--drift', (Math.random() * 80 - 40) + 'px');
    e.style.width = e.style.height = 2 + Math.random() * 3 + 'px';
    embers.appendChild(e);
  }
  const layers = [...cine.querySelectorAll('.cine-shot')];
  let shot = 0, front = 0;
  const show = (i) => { const el = layers[front ^= 1]; el.style.backgroundImage = `url("img/maps/${SHOTS[i % SHOTS.length]}.jpg")`; el.classList.remove('live'); void el.offsetWidth; el.classList.add('live'); layers[front ^ 1].classList.remove('on'); el.classList.add('on'); };
  show(0);
  let timer = reduce ? 0 : setInterval(() => { if (!cine.hidden) show(++shot); }, 7000);
  // Only while a menu is on screen (never over the match itself)
  const menu = document.getElementById('menu');
  const sync = () => { cine.hidden = !(document.body.classList.contains('is-gated') || (menu && !menu.classList.contains('hidden'))); };
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  if (menu) new MutationObserver(sync).observe(menu, { attributes: true, attributeFilter: ['class'] });
  sync();

  // ---------- sign-in card: brand column for phones held sideways ----------
  const card = document.querySelector('.gate-card');
  if (card && !card.querySelector('.gate-brand')) {
    const brand = document.createElement('div'); brand.className = 'gate-brand';
    for (const sel of ['.gate-mark', '#gate-title', '.gate-tag']) { const el = card.querySelector(sel); if (el) brand.appendChild(el); }
    card.prepend(brand);
    brand.style.gridRow = `1 / span ${card.children.length - 1}`;
  }

  // ---------- opening screen (markup in index.html so it shows before the game code has loaded) ----------
  const sp = document.getElementById('splash');
  if (sp) {
    const done = () => { if (sp.classList.contains('out')) return; sp.classList.add('out'); setTimeout(() => sp.remove(), 650); };
    sp.addEventListener('pointerdown', done);
    setTimeout(done, Math.max(400, 5000 - (Date.now() - (window.__splashT0 || Date.now())))); // 0.16.65: studio mark, then ~3.4 s of the poster
  }
  return { stop() { clearInterval(timer); timer = 0; } };
}
