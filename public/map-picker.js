// Map picker: the plain map <select> becomes a picture card. Tapping it opens a full-screen gallery of every map,
// each a framed photo from the real game (public/img/maps/<id>.jpg, made by tools/map-previews.cjs) with the map's
// name set into the picture in the player's language. Choosing one keeps the old behaviour (save + reload).
export function createMapPicker({ select, t, onPick }) {
  if (!select) return { refresh() {} };
  const ids = [...select.options].map((o) => o.value);
  const label = select.closest('label') || select;
  const card = document.createElement('button');
  card.type = 'button'; card.className = 'map-card map-card-current';
  label.after(card);
  label.classList.add('map-select-hidden');

  const sheet = document.createElement('div');
  sheet.className = 'map-sheet'; sheet.hidden = true;
  sheet.innerHTML = '<div class="map-sheet-inner" role="dialog" aria-modal="true"><div class="map-sheet-head"><h2></h2><button type="button" class="map-close" aria-label="Close">✕</button></div><div class="map-grid"></div></div>';
  document.body.appendChild(sheet);
  const grid = sheet.querySelector('.map-grid');

  function fill(el, id, current) {
    const big = id === 'city';
    el.style.setProperty('--img', `url("img/maps/${id}.jpg")`);
    el.innerHTML = '<span class="map-shot"></span><span class="map-shade"></span><span class="map-badge"></span><span class="map-text"><b></b><small></small></span>';
    el.querySelector('.map-badge').textContent = current ? '✓ ' + t('mapPick.current') : t(big ? 'mapPick.big' : 'mapPick.small');
    el.querySelector('.map-badge').classList.toggle('on', !!current);
    el.querySelector('b').textContent = t('map.' + id);
    el.querySelector('small').textContent = t('mapDesc.' + id);
    el.classList.toggle('is-current', !!current);
    el.setAttribute('aria-label', t('map.' + id));
  }
  function refresh() {
    fill(card, select.value, false);
    card.querySelector('.map-badge').textContent = '🗺 ' + t('mapPick.title');
    sheet.querySelector('h2').textContent = t('mapPick.title');
    grid.replaceChildren();
    ids.forEach((id, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'map-card';
      b.style.animationDelay = i * 35 + 'ms';
      fill(b, id, id === select.value);
      b.onclick = () => { close(); if (id !== select.value) onPick(id); };
      grid.appendChild(b);
    });
  }
  const open = () => { refresh(); sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add('open')); grid.querySelector('.is-current')?.scrollIntoView({ block: 'nearest' }); };
  const close = () => { sheet.classList.remove('open'); setTimeout(() => { sheet.hidden = true; }, 180); };
  card.onclick = open;
  sheet.querySelector('.map-close').onclick = close;
  sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) close(); });
  refresh();
  return { refresh, open };
}
