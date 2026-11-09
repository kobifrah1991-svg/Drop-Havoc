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
  let waking = false, wakeTry = 0, ping = 0, picked = null; // 0.16.62 server browser: ping of the game server, the room picked in the list
  async function loadRooms() {
    const sv = online();
    if (!sv) { serverUp = false; renderRooms(); return; }
    try {
      const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), wakeTry ? 12000 : 5000);
      const t0 = performance.now(); const r = await fetch(httpBase(sv) + '/rooms', { cache: 'no-store', signal: ctrl.signal }); clearTimeout(timer); ping = Math.round(performance.now() - t0);
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
    status.textContent = serverUp === null ? t(waking ? 'srv.waking' : 'start.checking') : serverUp ? t('start.serverUp', { n: rooms.reduce((a, r) => a + r.players, 0) }) + (ping ? ' · ' + ping + ' ms' : '') : t('start.serverDown');
    for (const b of root.querySelectorAll('.st-needs-server')) b.disabled = serverUp !== true;
    // 0.16.62 server browser (SA-MP / FiveM style): one line per open server room - lock, name (map + mode + code),
    // players, ping - and beside it the picked room: map picture, mode, a full list of who is playing, Join
    const list = $('.st-rooms'); list.replaceChildren();
    if (!rooms.length) { const p = document.createElement('p'); p.className = 'st-empty'; p.textContent = serverUp === false ? t('start.serverDownHint') : t('start.noRooms'); list.appendChild(p); return; }
    const sorted = [...rooms].sort((a, b) => b.players - a.players);
    if (!picked || !sorted.some((r) => r.code === picked)) picked = sorted[0].code;
    const wrap = document.createElement('div'); wrap.className = 'sb';
    const table = document.createElement('div'); table.className = 'sb-list'; table.setAttribute('role', 'listbox');
    const head = document.createElement('div'); head.className = 'sb-row sb-head';
    for (const k of ['', 'sb.server', 'sb.players', 'sb.ping']) { const c = document.createElement('span'); c.textContent = k ? t(k) : ''; head.appendChild(c); }
    table.appendChild(head);
    const join = (r) => {
      selectServer(online()?.id);
      if (r.locked) { const pass = ($('.sb-pass')?.value || '').trim(); if (!pass) { $('.sb-pass')?.focus(); return; } launch({ t: 'joinCode', code: r.code, pass }, r.map); }
      else launch({ t: 'joinCode', code: r.code }, r.map);
    };
    for (const r of sorted) {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'sb-row' + (r.code === picked ? ' on' : '') + (r.players >= r.capacity ? ' full' : '');
      row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(r.code === picked));
      const lock = document.createElement('span'); lock.className = 'sb-lock'; lock.textContent = r.locked ? '🔒' : '●';
      const name = document.createElement('span'); name.className = 'sb-name';
      const b = document.createElement('b'); b.textContent = t('map.' + (r.map || 'city'));
      const sm = document.createElement('small'); sm.textContent = t('mode.' + r.mode) + ' · ' + r.code;
      name.append(b, sm);
      const pl = document.createElement('span'); pl.className = 'sb-pl'; pl.textContent = r.players + '/' + r.capacity;
      const pg = document.createElement('span'); pg.className = 'sb-ping ' + (ping < 120 ? 'good' : ping < 250 ? 'ok' : 'bad'); pg.textContent = ping + ' ms';
      row.append(lock, name, pl, pg);
      row.onclick = () => { picked = r.code; renderRooms(); };
      row.ondblclick = () => { if (r.players < r.capacity) join(r); };
      table.appendChild(row);
    }
    const r = sorted.find((x) => x.code === picked);
    const side = document.createElement('aside'); side.className = 'sb-detail';
    side.style.setProperty('--img', `url("img/maps/${r.map || 'city'}.jpg")`);
    const full = r.players >= r.capacity, names = r.names || [];
    side.innerHTML = '<div class="sb-pic"><b></b><small></small></div><div class="sb-bar"><i></i></div><p class="sb-count"></p><h4></h4><ol class="sb-players"></ol><div class="sb-actions"></div>';
    side.querySelector('.sb-pic b').textContent = t('map.' + (r.map || 'city'));
    side.querySelector('.sb-pic small').textContent = t('mode.' + r.mode) + ' · ' + r.code + (r.locked ? ' · 🔒' : '');
    side.querySelector('.sb-bar i').style.width = Math.min(100, (r.players / r.capacity) * 100) + '%';
    side.querySelector('.sb-count').textContent = t('start.players', { n: r.players, max: r.capacity }) + (r.bots ? ' · ' + t('start.bots', { n: r.bots }) : '');
    side.querySelector('h4').textContent = t('sb.who');
    const ol = side.querySelector('.sb-players');
    if (names.length) for (const n of names) { const li = document.createElement('li'); li.textContent = n; ol.appendChild(li); }
    else { const li = document.createElement('li'); li.className = 'none'; li.textContent = t('start.noNames'); ol.appendChild(li); }
    const acts = side.querySelector('.sb-actions');
    if (r.locked) { const pass = document.createElement('input'); pass.className = 'sb-pass'; pass.maxLength = 12; pass.placeholder = t('rooms.passPh'); pass.autocomplete = 'off'; acts.appendChild(pass); }
    const jb = document.createElement('button'); jb.type = 'button'; jb.className = 'st-room-join'; jb.disabled = full; jb.textContent = full ? t('start.full') : t('start.join');
    jb.onclick = () => join(r); acts.appendChild(jb);
    wrap.append(table, side); list.appendChild(wrap);
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
