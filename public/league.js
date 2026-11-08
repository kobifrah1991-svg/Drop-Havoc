// National league panel (the season table from the game server's /league). Points come from online matches on the
// game server for players signed in with Google; one season = one calendar month.
export function createLeague({ t, getLang, serverUrl, myName }) {
  const sheet = document.createElement('div');
  sheet.className = 'map-sheet league-sheet'; sheet.hidden = true;
  sheet.innerHTML = '<div class="map-sheet-inner" role="dialog" aria-modal="true"><div class="map-sheet-head"><h2></h2><button type="button" class="map-close" aria-label="Close">✕</button></div>'
    + '<p class="league-season"></p><p class="league-rules"></p><div class="league-wrap"><table class="league-table"><thead><tr><th>#</th><th></th><th></th><th></th><th></th></tr></thead><tbody></tbody></table></div><p class="league-msg"></p></div>';
  document.body.appendChild(sheet);
  const $ = (s) => sheet.querySelector(s);
  const close = () => { sheet.classList.remove('open'); setTimeout(() => { sheet.hidden = true; }, 180); };
  $('.map-close').onclick = close;
  sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });

  function label() {
    $('h2').textContent = t('league.title');
    $('.league-rules').textContent = t('league.rules');
    const th = sheet.querySelectorAll('th');
    th[1].textContent = t('league.player'); th[2].textContent = t('league.points'); th[3].textContent = t('league.kills'); th[4].textContent = t('league.wins');
  }
  async function open() {
    label(); sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add('open'));
    const body = $('tbody'); body.replaceChildren(); $('.league-msg').textContent = t('league.loading'); $('.league-season').textContent = '';
    const url = serverUrl();
    if (!url) { $('.league-msg').textContent = t('league.offline'); return; }
    try {
      const r = await fetch(url.replace(/\/$/, '') + '/league', { cache: 'no-store' });
      const data = await r.json();
      const [y, m] = String(data.season || '').split('-').map(Number);
      $('.league-season').textContent = y ? t('league.season', { month: new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(getLang(), { month: 'long', year: 'numeric' }) }) : '';
      const me = String(myName() || '').trim().toLowerCase();
      for (const row of data.top || []) {
        const tr = document.createElement('tr');
        if (me && row.name.toLowerCase() === me) tr.className = 'me';
        for (const v of [row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : row.rank, row.name, row.points, row.kills, row.wins]) { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); }
        body.appendChild(tr);
      }
      $('.league-msg').textContent = (data.top || []).length ? '' : t('league.empty');
    } catch { $('.league-msg').textContent = t('league.offline'); }
  }
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) close(); });
  return { open, label };
}
