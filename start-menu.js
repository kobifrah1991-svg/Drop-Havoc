// Start flow (0.16.44): after the opening screen and sign-in, players land here.
//   Home    : language, name, two big picture cards: SINGLE PLAYER (vs bots) / MULTIPLAYER (real players),
//             plus Character & settings, Shop, Garage, League.
//   Solo    : pick a map from pictures (name on each), pick the difficulty, Play.
//   Online  : server status, Quick match / Free roam, the open rooms as picture cards (map, mode, players and
//             their names), create a room (mode, map, size, public), join by code, play with friends (direct).
// Everything ends in the existing startOnline(action) of client.js, so the game code paths stay the same.
const MAPS = ['city', 'neon', 'canyon', 'harbor', 'jungle', 'rooftop', 'base', 'snow', 'factory', 'town'];

export function createStartMenu({ t, store, currentMap, servers, selectServer, httpBase, startOnline, openMenu, openShop, openGarage, openLeague, nameInput }) {
  const root = document.getElementById('start');
  if (!root) return { show() {}, hide() {}, refresh() {} };
  const $ = (s) => root.querySelector(s);
  let view = 'home', soloMap = store.get('map', 'city'), onlineMap = 'city', difficulty = store.get('difficulty', 'normal'), roomsTimer = 0;

  const go = (v) => {
    view = v;
    for (const p of root.querySelectorAll('[data-view]')) p.hidden = p.dataset.view !== v;
    clearInterval(roomsTimer); roomsTimer = 0;
    if (v === 'online') { loadRooms(); roomsTimer = setInterval(() => { if (!waking) loadRooms(); }, 10000); }
    root.scrollTop = 0;
  };
  // ---------- map cards (picture + name) ----------
  function mapGrid(el, selected, onPick, only) {
    el.replaceChildren();
    for (const id of only || MAPS) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'map-card st-map' + (id === selected ? ' is-current' : '');
      b.style.setProperty('--img', `url("img/maps/${id}.jpg")`);
      b.innerHTML = '<span class="map-shot"></span><span class="map-shade"></span><span class="map-badge"></span><span class="map-text"><b></b><small></small></span>';
      b.querySelector('.map-badge').textContent = id === selected ? '✓ ' + t('mapPick.current') : t(id === 'city' ? 'mapPick.big' : 'mapPick.small');
      b.querySelector('.map-badge').classList.toggle('on', id === selected);
      b.querySelector('b').textContent = t('map.' + id); b.querySelector('small').textContent = t('mapDesc.' + id);
      b.onclick = () => onPick(id);
      el.appendChild(b);
    }
  }
  // A different map needs the page to load that map first: remember what to start and reload
  function launch(action, map) {
    if (nameInput) store.set('name', nameInput.value.trim());
    if (map && map !== currentMap()) {
      store.set('map', map);
      try { sessionStorage.setItem('arena.autojoin', JSON.stringify({ action, name: nameInput?.value || '' })); } catch { /* ignore */ }
      location.reload(); return;
    }
    startOnline(action);
  }
  const online = () => servers().find((sv) => !sv.offline);

  // ---------- solo ----------
  function renderSolo() {
    mapGrid($('.st-solo-maps'), soloMap, (id) => { soloMap = id; renderSolo(); });
    for (const b of root.querySelectorAll('.st-diff button')) { b.classList.toggle('on', b.dataset.d === difficulty); }
  }
  for (const b of root.querySelectorAll('.st-diff button')) b.onclick = () => { difficulty = b.dataset.d; store.set('difficulty', difficulty); const sel = document.getElementById('difficulty'); if (sel) sel.value = difficulty; renderSolo(); };
  $('.st-solo-play').onclick = () => { selectServer('device'); launch({ t: 'quickMatch' }, soloMap); };

  // ---------- online ----------
  let rooms = [], serverUp = null;
  // 0.16.55 a sleeping free server wakes in up to a minute: show "waking" and keep asking instead of "down"
  let waking = false, wakeTry = 0;
  async function loadRooms() {
    const sv = online();
    if (!sv) { serverUp = false; renderRooms(); return; }
    try {
      const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), wakeTry ? 12000 : 5000);
      const r = await fetch(httpBase(sv) + '/rooms', { cache: 'no-store', signal: ctrl.signal }); clearTimeout(timer);
      if (!r.ok) throw Error('http');
      rooms = await r.json(); serverUp = true; waking = false; wakeTry = 0;
    } catch {
      rooms = [];
      if (wakeTry < 7) { wakeTry++; waking = true; serverUp = null; renderRooms(); setTimeout(loadRooms, 3000); return; }
      serverUp = false; waking = false;
    }
    renderRooms();
  }
  function renderRooms() {
    const status = $('.st-server');
    status.className = 'st-server ' + (serverUp === null ? '' : serverUp ? 'up' : 'down');
    status.textContent = serverUp === null ? t(waking ? 'srv.waking' : 'start.checking') : serverUp ? t('start.serverUp', { n: rooms.reduce((a, r) => a + r.players, 0) }) : t('start.serverDown');
    for (const b of root.querySelectorAll('.st-needs-server')) b.disabled = serverUp !== true;
    const list = $('.st-rooms'); list.replaceChildren();
    if (!rooms.length) { const p = document.createElement('p'); p.className = 'st-empty'; p.textContent = serverUp === false ? t('start.serverDownHint') : t('start.noRooms'); list.appendChild(p); return; }
    for (const r of [...rooms].sort((a, b) => b.players - a.players)) {
      const card = document.createElement('div'); card.className = 'st-room';
      card.style.setProperty('--img', `url("img/maps/${r.map || 'city'}.jpg")`);
      const full = r.players >= r.capacity;
      const names = (r.names || []);
      card.innerHTML = '<span class="st-room-pic"></span><div class="st-room-info"><b></b><small class="st-room-mode"></small><div class="st-room-bar"><i></i></div><small class="st-room-count"></small><p class="st-room-names"></p></div><button type="button" class="st-room-join"></button>';
      card.querySelector('b').textContent = t('map.' + (r.map || 'city')) + (r.locked ? ' 🔒' : '');
      card.querySelector('.st-room-mode').textContent = t('mode.' + r.mode) + ' · ' + r.code;
      card.querySelector('.st-room-bar i').style.width = Math.min(100, (r.players / r.capacity) * 100) + '%';
      card.querySelector('.st-room-count').textContent = t('start.players', { n: r.players, max: r.capacity }) + (r.bots ? ' · ' + t('start.bots', { n: r.bots }) : '');
      card.querySelector('.st-room-names').textContent = names.length ? names.slice(0, 8).join(' · ') + (names.length > 8 ? ` +${names.length - 8}` : '') : t('start.noNames');
      const join = card.querySelector('.st-room-join');
      join.textContent = full ? t('start.full') : r.locked ? t('start.enterCode') : t('start.join');
      join.disabled = full;
      join.onclick = () => {
        selectServer(online()?.id);
        if (r.locked) { const pass = prompt(t('rooms.passPh')) || ''; launch({ t: 'joinCode', code: r.code, pass }); }
        else launch({ t: 'joinCode', code: r.code });
      };
      list.appendChild(card);
    }
  }
  function renderOnline() {
    mapGrid($('.st-online-maps'), onlineMap, (id) => { onlineMap = id; renderOnline(); });
    const mode = $('.st-mode').value;
    $('.st-online-maps').classList.toggle('st-locked', mode === 'roam');
    $('.st-map-note').textContent = mode === 'roam' ? t('start.roamCity') : '';
    $('.st-cap').disabled = mode === 'duel' || mode === 'team2';
  }
  $('.st-mode').onchange = renderOnline;
  $('.st-quick').onclick = () => { selectServer(online()?.id); launch({ t: 'quickMatch' }, onlineMap); };
  $('.st-roam').onclick = () => { selectServer(online()?.id); launch({ t: 'quickRoam' }, 'city'); };
  $('.st-create').onclick = () => {
    selectServer(online()?.id);
    const mode = $('.st-mode').value;
    launch({ t: 'create', mode, capacity: Number($('.st-cap').value), public: $('.st-public').checked }, mode === 'roam' ? 'city' : onlineMap);
  };
  $('.st-join').onclick = () => { const code = $('.st-code').value.trim().toUpperCase(); if (!code) return; selectServer(online()?.id); launch({ t: 'joinCode', code, pass: $('.st-pass').value.trim() }); };
  $('.st-friends-host').onclick = () => { const mode = $('.st-mode').value; launch({ t: 'p2pHost', mode, capacity: Number($('.st-cap').value) }, mode === 'roam' ? 'city' : onlineMap); };
  $('.st-friends-join').onclick = () => { const code = $('.st-fcode').value.trim().toUpperCase(); if (code) launch({ t: 'p2pJoin', code }); };

  // ---------- home ----------
  $('.st-card-solo').onclick = () => { renderSolo(); go('solo'); };
  $('.st-card-online').onclick = () => { renderOnline(); go('online'); };
  for (const b of root.querySelectorAll('.st-back')) b.onclick = () => go('home');
  $('.st-character').onclick = () => openMenu();
  $('.st-shop').onclick = () => openShop();
  $('.st-garage').onclick = () => openGarage();
  $('.st-league').onclick = () => openLeague();
  const nm = $('.st-name');
  if (nameInput) { nm.value = nameInput.value || store.get('name', ''); nm.oninput = () => { nameInput.value = nm.value; store.set('name', nm.value.trim()); }; }

  function refresh() { if (view === 'solo') renderSolo(); if (view === 'online') { renderOnline(); renderRooms(); } }
  return {
    show() { root.hidden = false; document.body.classList.add('start-open'); go(view); },
    hide() { root.hidden = true; document.body.classList.remove('start-open'); clearInterval(roomsTimer); roomsTimer = 0; },
    refresh,
  };
}
