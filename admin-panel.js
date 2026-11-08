// Admin page for the online server: sign in with Google (Firebase Authentication) or the server's ADMIN_CODE,
// then manage the players who are connected right now. The page only asks; the server checks every action
// (admin.js panel()). Owners: the Google accounts listed in admin.js OWNERS.
import { GAME_PROTOCOL } from './shared/protocol.js';
import { ONLINE_SERVERS } from './shared/servers.js';

const $ = (id) => document.getElementById(id);
// The server that hosts this page, or the game's online server when the page is opened from the static site
const base = /onrender\.com|localhost|127\.0\.0\.1/.test(location.hostname) ? location.origin : ONLINE_SERVERS[0].url;
const wsUrl = base.replace(/^http/, 'ws');
const REASONS = ['קללות', 'הפרעה למשחק', 'לא מקשיב', 'רמאות', 'התנהגות לא הולמת', 'הצפת צ\'אט'];
const DURS = [[10, '10 דקות'], [60, 'שעה'], [1440, 'יום'], [10080, 'שבוע'], [0, 'לתמיד']];
const ACTS = { warn: 'אזהרה', mute: 'השתקת צ\'אט', kick: 'הוצאה מהמשחק', ban: 'חסימה' };
const TEXT = { 'panel.welcome': 'נכנסת בהצלחה', 'panel.notStaff': 'החשבון הזה אינו מנהל', 'panel.badLogin': 'הכניסה נכשלה', 'admin.loginFail': 'קוד שגוי', 'admin.denied': 'אין לך הרשאה לפעולה הזו',
  'admin.noTarget': 'השחקן כבר לא מחובר', 'admin.rate': 'יותר מדי פעולות, חכו כמה שניות', 'panel.done': 'בוצע', 'admin.unknown': 'פעולה לא מוכרת', 'admin.badArgs': 'חסר טקסט',
  'panel.badEmail': 'כתובת מייל לא תקינה', 'panel.locked': 'אי אפשר לשנות את המנהלים הראשיים או להוריד את עצמך', 'panel.noPlayer': 'אין שחקן מחובר בשם הזה. אפשר להוסיף לפי מייל.',
  'panel.needsGoogle': 'השחקן הזה מחובר כאורח. הוא צריך להתחבר עם Google, או שתוסיפו אותו לפי המייל.' };
const ROLE_HE = { Player: 'שחקן', Moderator: 'מנחה', Admin: 'אדמין', Owner: 'בעלים' };

let ws = null, role = null, timer = 0;
function msg(text, kind = '') { const el = role ? $('msg') : $('login-msg'); el.textContent = text; el.className = 'msg ' + kind; }
function send(m) { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); }

function connect(onOpen) {
  if (ws && ws.readyState <= 1) { onOpen(); return; }
  ws = new WebSocket(wsUrl);
  ws.onopen = () => { ws.send(JSON.stringify({ t: 'auth', protocol: GAME_PROTOCOL })); onOpen(); };
  ws.onclose = () => { if (role) msg('החיבור לשרת נותק. מרעננים...', 'err'); clearInterval(timer); setTimeout(() => location.reload(), 3000); };
  ws.onerror = () => msg('השרת לא זמין כרגע (אולי הוא ישן: נסו שוב בעוד דקה)', 'err');
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'panel') onPanel(m); };
}
function onPanel(m) {
  if (m.list) return render(m);
  if (m.audit) return renderLog(m.audit);
  if (m.staff) return renderStaff(m.staff);
  if (!role && m.ok && m.role) {
    role = m.role; $('login').classList.add('hidden'); $('app').classList.remove('hidden');
    $('who').textContent = m.email || 'כניסה עם קוד'; $('role').textContent = ROLE_HE[role] || role;
    $('staff-tab').classList.toggle('hidden', role !== 'Owner');
    refresh(); timer = setInterval(refresh, 3000);
    return;
  }
  msg(TEXT[m.key] || m.key || '', m.ok ? 'ok' : 'err');
  if (m.ok) refresh();
  if (m.staffChanged) send({ t: 'panel', a: 'staff' });
}
const refresh = () => send({ t: 'panel', a: 'list' });

// ---- login ----
$('code-go').onclick = () => { const code = $('code').value.trim(); if (!code) return; connect(() => send({ t: 'panel', a: 'login', code })); };
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('code-go').click(); });
let firebaseCfg = null;
fetch(base + '/config').then((r) => r.json()).then((c) => { firebaseCfg = c.firebase; if (!firebaseCfg) $('google-note').textContent = 'כניסה עם Google עוד לא הוגדרה בשרת (FIREBASE_API_KEY). אפשר להיכנס עם קוד.'; })
  .catch(() => { $('google-note').textContent = 'השרת לא זמין כרגע'; });
async function loadScript(src) { await new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); }); }
$('google').onclick = async () => {
  if (!firebaseCfg) { msg('כניסה עם Google עוד לא הוגדרה בשרת', 'err'); return; }
  try {
    msg('פותח חלון כניסה של Google...');
    await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
    await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js');
    const fb = window.firebase; if (!fb.apps.length) fb.initializeApp(firebaseCfg);
    const res = await fb.auth().signInWithPopup(new fb.auth.GoogleAuthProvider());
    const idToken = await res.user.getIdToken();
    connect(() => send({ t: 'panel', a: 'login', idToken }));
  } catch (e) { msg('הכניסה עם Google נכשלה: ' + (e?.code || e?.message || e), 'err'); }
};

// ---- tabs ----
for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => {
  for (const x of document.querySelectorAll('.tabs button')) x.classList.toggle('on', x === b);
  for (const p of document.querySelectorAll('[data-pane]')) p.classList.toggle('hidden', p.dataset.pane !== b.dataset.tab);
  if (b.dataset.tab === 'log') send({ t: 'panel', a: 'audit' });
  if (b.dataset.tab === 'staff') send({ t: 'panel', a: 'staff' });
};
$('say-go').onclick = () => { const text = $('say-text').value.trim(); if (text) { send({ t: 'panel', a: 'announce', text }); $('say-text').value = ''; } };

// ---- lists ----
const fmtUntil = (u) => (u ? new Date(u).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : 'לתמיד');
function cell(tr, text) { const td = document.createElement('td'); td.textContent = text; tr.appendChild(td); return td; }
function render(m) {
  $('stats').textContent = `${m.list.length} שחקנים מחוברים · ${m.rooms} חדרים`;
  const body = $('players'); body.replaceChildren();
  for (const p of m.list) {
    const tr = document.createElement('tr');
    const n = cell(tr, p.name); if (p.role !== 'Player') { const b = document.createElement('span'); b.className = 'badge staff'; b.textContent = ' ' + p.role; n.appendChild(b); }
    cell(tr, p.room || '—'); cell(tr, `${p.kills}/${p.deaths}`); cell(tr, p.ping + 'ms');
    const st = cell(tr, p.signedIn ? 'מחובר עם Google' : 'אורח');
    if (p.muted !== null) { const b = document.createElement('span'); b.className = 'badge mute'; b.textContent = ' מושתק'; st.appendChild(b); }
    if (p.warnings) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = ` ${p.warnings} אזהרות`; st.appendChild(b); }
    const acts = document.createElement('div'); acts.className = 'acts';
    if (role === 'Owner' && p.role !== 'Owner') {
      const b = document.createElement('button'); b.textContent = p.role === 'Player' ? 'מינוי למנהל' : 'עריכת דרגה';
      b.onclick = () => { $('staff-who').value = p.signedIn ? p.name : ''; document.querySelector('[data-tab=staff]').click(); if (!p.signedIn) msg(TEXT['panel.needsGoogle'], 'err'); };
      acts.appendChild(b);
    }
    for (const [a, label] of Object.entries(ACTS)) {
      if (a === 'ban' && role === 'Moderator') continue;
      const b = document.createElement('button'); b.textContent = label; b.className = a === 'ban' ? 'red' : a === 'kick' ? 'blue' : '';
      b.onclick = () => openAct(a, p); acts.appendChild(b);
    }
    cell(tr, '').appendChild(acts);
    body.appendChild(tr);
  }
  $('empty').textContent = m.list.length ? '' : 'אין כרגע שחקנים מחוברים.';
  const bans = $('bans'); bans.replaceChildren();
  for (const b of m.bans) {
    const tr = document.createElement('tr');
    cell(tr, b.type === 'ban' ? 'חסימה' : 'השתקה'); cell(tr, b.name || b.email || b.ip || '—'); cell(tr, b.reason); cell(tr, fmtUntil(b.until)); cell(tr, b.by);
    const btn = document.createElement('button'); btn.className = 'green'; btn.textContent = b.type === 'ban' ? 'ביטול חסימה' : 'ביטול השתקה';
    btn.onclick = () => send({ t: 'panel', a: 'unban', id: b.id }); cell(tr, '').appendChild(btn);
    bans.appendChild(tr);
  }
}
function renderLog(lines) {
  const body = $('log'); body.replaceChildren();
  for (const l of lines) { const tr = document.createElement('tr'); cell(tr, new Date(l.time).toLocaleString('he-IL', { timeStyle: 'short', dateStyle: 'short' })); cell(tr, l.admin); cell(tr, l.action); cell(tr, l.target ?? ''); cell(tr, l.value ?? ''); cell(tr, l.result); body.appendChild(tr); }
}

// ---- action dialog (reason + duration) ----
let pending = null, reason = '', minutes = 60;
function chips(el, items, get, set) {
  el.replaceChildren();
  for (const [value, label] of items) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.classList.toggle('on', get() === value); b.onclick = () => { set(value); chips(el, items, get, set); }; el.appendChild(b); }
}
function openAct(a, p) {
  pending = { a, sid: p.sid }; reason = REASONS[0]; minutes = a === 'mute' ? 10 : 60;
  $('act-title').textContent = `${ACTS[a]}: ${p.name}`; $('reason').value = '';
  chips($('reasons'), REASONS.map((r) => [r, r]), () => reason, (v) => { reason = v; });
  $('dur-wrap').classList.toggle('hidden', a === 'warn' || a === 'kick');
  chips($('durs'), DURS, () => minutes, (v) => { minutes = v; });
  $('act').showModal();
}
$('act-cancel').onclick = () => $('act').close();
$('act-go').onclick = () => { if (pending) send({ t: 'panel', a: pending.a, sid: pending.sid, reason: $('reason').value.trim() || reason, minutes }); $('act').close(); };

// ---- staff (owners only) ----
$('staff-add').onclick = () => {
  const who = $('staff-who').value.trim(); if (!who) return;
  send({ t: 'panel', a: 'setrole', email: who, role: $('staff-role').value }); $('staff-who').value = '';
};
function renderStaff(list) {
  const body = $('staff'); body.replaceChildren();
  for (const s of list) {
    const tr = document.createElement('tr');
    const n = cell(tr, s.name ? `${s.name} · ${s.email}` : s.email);
    if (s.online) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = ' מחובר'; n.appendChild(b); }
    if (s.by) { const d = document.createElement('div'); d.className = 'muted'; d.textContent = 'נוסף על ידי ' + s.by; n.appendChild(d); }
    const rc = cell(tr, '');
    if (s.locked) { rc.textContent = 'בעלים · מנהל ראשי'; cell(tr, 'לא ניתן להסרה').className = 'muted'; body.appendChild(tr); continue; }
    const sel = document.createElement('select');
    for (const r of ['Moderator', 'Admin', 'Owner']) { const o = document.createElement('option'); o.value = r; o.textContent = ROLE_HE[r]; o.selected = r === s.role; sel.appendChild(o); }
    sel.onchange = () => send({ t: 'panel', a: 'setrole', email: s.email, role: sel.value });
    rc.appendChild(sel);
    const rm = document.createElement('button'); rm.className = 'red'; rm.textContent = 'הסרה';
    rm.onclick = () => { if (rm.dataset.sure) send({ t: 'panel', a: 'setrole', email: s.email, role: 'Player' }); else { rm.dataset.sure = 1; rm.textContent = 'בטוח? לחצו שוב'; } };
    cell(tr, '').appendChild(rm);
    body.appendChild(tr);
  }
}
