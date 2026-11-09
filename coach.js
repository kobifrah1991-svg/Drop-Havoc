// 0.16.55 First-match coach: short tips that show once each, at the moment they matter (falling, landed, first gun,
// first live event, a while into the match). Remembered on the device; "Hide tips" turns them all off.
const KEY = 'dh.coach';
const ORDER = ['drop', 'loot', 'fight', 'rope', 'city', 'event'];

export function createCoach({ t, isTouch }) {
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { seen = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch { /* storage blocked */ } };
  const card = document.createElement('div'); card.id = 'coach'; card.hidden = true; card.setAttribute('role', 'status');
  card.innerHTML = '<b class="co-title"></b><p class="co-text"></p><div class="co-actions"><button type="button" class="co-ok"></button><button type="button" class="co-off"></button></div>';
  document.body.appendChild(card);
  let showing = null, hideAt = 0, landedAt = 0, queue = [];
  const close = () => { card.hidden = true; showing = null; };
  card.querySelector('.co-ok').onclick = close;
  card.querySelector('.co-off').onclick = () => { for (const k of ORDER) seen[k] = 1; seen.off = 1; save(); queue = []; close(); };
  function want(id) { if (seen.off || seen[id] || queue.includes(id) || showing === id) return; queue.push(id); }
  function show(id, now) {
    seen[id] = 1; save(); showing = id; hideAt = now + 11000;
    const touch = isTouch();
    card.querySelector('.co-title').textContent = t('coach.' + id + '.title');
    const tk = 'coach.' + id + '.touch', tt = touch ? t(tk) : tk;
    card.querySelector('.co-text').textContent = tt !== tk ? tt : t('coach.' + id);
    card.querySelector('.co-ok').textContent = t('coach.ok');
    card.querySelector('.co-off').textContent = t('coach.off');
    card.hidden = false;
  }
  return {
    // called every frame with a small picture of the player's situation
    update(now, s) {
      if (!s.inMatch || !s.alive) { if (showing) close(); return; }
      if (s.parachuting) { landedAt = 0; want('drop'); }
      else if (s.onGround) {
        if (!landedAt) landedAt = now;
        if (now - landedAt > 1500) want('loot');
        if (s.hasGun) want('fight');
        if (now - landedAt > 20000) want('rope');
        if (now - landedAt > 45000) want('city');
      }
      if (s.event) want('event');
      if (showing && now > hideAt) close();
      if (!showing && queue.length) show(queue.shift(), now);
    },
    matchEnded() { landedAt = 0; queue = []; close(); },
    reset() { seen = {}; save(); },
  };
}
