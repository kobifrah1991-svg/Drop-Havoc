// GTA-style weapon wheel. Hold Q (desktop) or long-press the swap button (touch): the owned weapons fan
// out in a ring, you point at one (mouse movement or finger drag from the centre), release to equip.
// A quick tap keeps the old behaviour (next weapon). The wheel only picks; equipping goes through the
// caller's switchWeapon, so the server rules stay the same.
export function createWeaponWheel({ list, pick, label, ammo }) {
  const root = document.createElement('div');
  root.id = 'weapon-wheel';
  root.hidden = true;
  root.innerHTML = '<div class="ww-ring"></div><div class="ww-center"><b></b><small></small></div>';
  document.body.appendChild(root);
  const ring = root.querySelector('.ww-ring'), cName = root.querySelector('.ww-center b'), cAmmo = root.querySelector('.ww-center small');
  let items = [], sel = -1, vx = 0, vy = 0, isOpen = false, ox = null, oy = null;

  function render() {
    ring.replaceChildren();
    const n = items.length;
    items.forEach((k, i) => {
      // Slot 0 at the top, clockwise
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const el = document.createElement('div');
      el.className = 'ww-slot' + (i === sel ? ' on' : '');
      el.style.left = 50 + Math.cos(a) * 38 + '%';
      el.style.top = 50 + Math.sin(a) * 38 + '%';
      el.innerHTML = '<span></span><small></small>';
      el.firstChild.textContent = label(k);
      el.lastChild.textContent = ammo(k);
      ring.appendChild(el);
    });
    const k = items[sel];
    cName.textContent = k ? label(k) : '';
    cAmmo.textContent = k ? ammo(k) : '';
  }
  // Direction of the accumulated pointer movement chooses the slot (needs a small push to count)
  function aim(dx, dy) {
    vx += dx; vy += dy;
    const len = Math.hypot(vx, vy);
    if (len > 90) { vx *= 90 / len; vy *= 90 / len; }
    if (len < 18 || !items.length) return;
    let a = Math.atan2(vy, vx) + Math.PI / 2; // 0 = up
    if (a < 0) a += Math.PI * 2;
    const i = Math.round(a / (Math.PI * 2 / items.length)) % items.length;
    if (i !== sel) { sel = i; render(); }
  }
  return {
    get open() { return isOpen; },
    show(current) {
      items = list();
      if (items.length < 2) return false;
      sel = Math.max(0, items.indexOf(current)); vx = vy = 0; ox = oy = null;
      isOpen = true; root.hidden = false; render();
      return true;
    },
    move: aim,
    // Touch: direction from where the finger was when the wheel opened (not from the screen centre)
    pointAt(x, y) { if (ox === null) { ox = x; oy = y; return; } vx = vy = 0; aim((x - ox) * 2.5, (y - oy) * 2.5); },
    close(apply = true) {
      if (!isOpen) return;
      isOpen = false; root.hidden = true;
      if (apply && items[sel]) pick(items[sel]);
    },
  };
}
