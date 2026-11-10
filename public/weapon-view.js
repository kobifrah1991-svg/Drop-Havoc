// Weapons screen (I, or the bag button on phones): a big GTA-style board of the weapons you carry, in the same order
// and with the same numbers as the bar at the bottom of the screen. Each card shows the weapon's picture, its slot
// number, name and ammo; the one in your hands is highlighted. Pick with a click/tap, the number keys, or the mouse
// wheel / arrow keys and Enter (works while the mouse is captured). Press I again (or Esc) to close.
export function createWeaponView({ list, current, pick, label, ammo, icon, title }) {
  const root = document.createElement('div');
  root.id = 'weapon-view'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
  root.innerHTML = '<div class="wv-card"><div class="wv-head"><b class="wv-title"></b><span class="wv-keys"></span></div><div class="wv-grid" role="listbox"></div></div>';
  document.body.appendChild(root);
  const grid = root.querySelector('.wv-grid');
  let focus = 0;
  for (const ev of ['pointerdown', 'touchstart', 'mousedown']) root.querySelector('.wv-card').addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
  root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
  function render() {
    const items = list(), cur = current();
    root.querySelector('.wv-title').textContent = title();
    root.querySelector('.wv-keys').textContent = items.length ? '1–' + Math.min(9, items.length) : '';
    if (focus >= items.length) focus = Math.max(0, items.length - 1);
    grid.replaceChildren();
    if (!items.length) { const p = document.createElement('p'); p.className = 'wv-empty'; p.textContent = label(null); grid.appendChild(p); return; }
    items.forEach((k, i) => {
      const c = document.createElement('button'); c.type = 'button';
      c.className = 'wv-item' + (k === cur ? ' on' : '') + (i === focus ? ' focus' : '');
      c.setAttribute('role', 'option'); c.setAttribute('aria-selected', String(k === cur));
      const img = document.createElement('img'); img.alt = ''; img.className = 'wv-img';
      const src = icon(k); if (src) img.src = src; else img.classList.add('blank');
      const n = document.createElement('span'); n.className = 'wv-num'; n.textContent = i < 9 ? String(i + 1) : '';
      const nm = document.createElement('b'); nm.textContent = label(k);
      const am = document.createElement('small'); am.textContent = ammo(k);
      c.append(n, img, nm, am);
      c.addEventListener('click', () => { focus = i; pick(k); render(); });
      grid.appendChild(c);
    });
  }
  function open() { if (!root.hidden) return; const items = list(), i = items.indexOf(current()); focus = i >= 0 ? i : 0; root.hidden = false; render(); }
  function close() { root.hidden = true; }
  return {
    open, close, render,
    toggle() { if (root.hidden) open(); else close(); },
    get isOpen() { return !root.hidden; },
    // mouse wheel / arrow keys move the highlight, Enter or a click equips it (the mouse may be captured by the game)
    move(d) { const n = list().length; if (!n) return; focus = (focus + d + n) % n; render(); },
    choose() { const k = list()[focus]; if (k) { pick(k); render(); } },
  };
}
