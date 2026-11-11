// GTA-style weapon wheel. Desktop: hold Q. Phone / APK: tap the weapon button (it stays open).
// Drag to highlight, release after a drag to equip. Tap a slot to equip. Close, Escape, or a tap
// outside the ring leaves the current weapon alone.
export function createWeaponWheel({ list, pick, label, ammo, icon }) {
  const root = document.createElement('div');
  root.id = 'weapon-wheel';
  root.hidden = true;
  root.innerHTML = '<button type="button" class="ww-close" aria-label="Close">✕</button><div class="ww-ring"></div><div class="ww-center"><img alt=""><b></b><small></small></div>';
  document.body.appendChild(root);
  const ring = root.querySelector('.ww-ring');
  const cName = root.querySelector('.ww-center b');
  const cAmmo = root.querySelector('.ww-center small');
  const cImg = root.querySelector('.ww-center img');
  const closeBtn = root.querySelector('.ww-close');
  let items = [], sel = -1, vx = 0, vy = 0, isOpen = false, ox = null, oy = null;

  function paint() {
    ring.replaceChildren();
    const n = Math.max(1, items.length);
    items.forEach((k, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'ww-slot' + (i === sel ? ' on' : '');
      el.style.left = 50 + Math.cos(a) * 34 + '%';
      el.style.top = 50 + Math.sin(a) * 34 + '%';
      el.innerHTML = '<img alt=""><span></span><small></small>';
      const src = icon ? icon(k) : '';
      if (src) el.querySelector('img').src = src; else el.querySelector('img').hidden = true;
      el.querySelector('span').textContent = label(k);
      el.querySelector('small').textContent = ammo(k);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); sel = i; paint(); close(true); });
      ring.appendChild(el);
    });
    const k = items[sel];
    cName.textContent = k ? label(k) : '';
    cAmmo.textContent = k ? ammo(k) : '';
    const big = k && icon ? icon(k) : '';
    if (big) { cImg.hidden = false; cImg.src = big; } else cImg.hidden = true;
  }
  function aim(dx, dy) {
    vx += dx; vy += dy;
    const len = Math.hypot(vx, vy);
    if (len > 90) { vx *= 90 / len; vy *= 90 / len; }
    if (len < 14 || !items.length) return;
    let a = Math.atan2(vy, vx) + Math.PI / 2;
    if (a < 0) a += Math.PI * 2;
    const i = Math.round(a / (Math.PI * 2 / items.length)) % items.length;
    if (i !== sel) { sel = i; paint(); }
  }
  function close(apply = true) {
    if (!isOpen) return;
    isOpen = false; root.hidden = true;
    if (apply && items[sel]) pick(items[sel]);
  }
  closeBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); close(false); });
  root.addEventListener('pointerdown', (e) => { if (e.target === root) { e.preventDefault(); close(false); } });
  return {
    get open() { return isOpen; },
    show(current) {
      items = list();
      if (!items.length) return false;
      sel = Math.max(0, items.indexOf(current));
      vx = vy = 0; ox = oy = null;
      isOpen = true; root.hidden = false; paint();
      return true;
    },
    move: aim,
    pointAt(x, y) { if (ox === null) { ox = x; oy = y; return; } vx = vy = 0; aim((x - ox) * 2.2, (y - oy) * 2.2); },
    close,
  };
}
