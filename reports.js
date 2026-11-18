// Player reports. Appended to data/reports.jsonl on the game server (wiped on Render Free restart)
// and, when FIRESTORE_PROJECT is set, created in the top-level `reports` collection.
// That Firestore write is the durable copy. It uses FIREBASE_SERVICE_ACCOUNT when set
// (see firestore-auth.js) and stays unauthenticated until then, matching the old server.
// Clients never read these documents. firestore.rules denies client access; do not publish
// those rules until the service account is set, or the unauthenticated fallback is rejected.
import fs from 'node:fs';
import path from 'node:path';
import { resolveAuthHeaders } from './firestore-auth.js';

export const REPORT_LIMITS = { perAccount: 3, perIp: 8, windowMs: 10 * 60 * 1000 };

export function createReportStore({ dataDir, env = process.env, fetchFn = fetch, authHeaders = null } = {}) {
  const file = dataDir ? path.join(dataDir, 'reports.jsonl') : null;
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const project = env.FIRESTORE_PROJECT;
  const headerFor = authHeaders || resolveAuthHeaders;
  const hits = new Map();
  let rows = [];
  if (file && fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { rows.push(JSON.parse(line)); } catch { /* skip a torn line */ }
    }
  }
  function rewrite() {
    if (!file) return;
    fs.writeFileSync(file, rows.length ? rows.map((r) => JSON.stringify(r)).join('\n') + '\n' : '');
  }
  async function authHead() {
    let auth = {};
    try { auth = await headerFor(env); } catch (err) { console.error('report auth failed:', err.message); }
    const headers = { ...auth };
    if (!headers.Authorization && env.FIRESTORE_TOKEN) headers.Authorization = 'Bearer ' + env.FIRESTORE_TOKEN;
    return headers;
  }

  // A report needs a server-side account id (signed-in user or guest device token).
  // The same account and the same IP are capped so a new socket cannot reset the limit.
  function allow({ accountId, ip, now = Date.now() } = {}) {
    if (!accountId) return { ok: false, key: 'sys.reportNeedAccount' };
    const take = (key, limit) => {
      const list = (hits.get(key) || []).filter((t) => now - t < REPORT_LIMITS.windowMs);
      if (list.length >= limit) { hits.set(key, list); return false; }
      list.push(now);
      hits.set(key, list);
      return true;
    };
    if (!take('acct:' + accountId, REPORT_LIMITS.perAccount)) return { ok: false, key: 'sys.reportRate' };
    if (ip && !take('ip:' + ip, REPORT_LIMITS.perIp)) return { ok: false, key: 'sys.reportRate' };
    return { ok: true };
  }

  async function save(row) {
    const report = {
      reporterId: String(row.reporterId || '').slice(0, 120),
      reporterUid: String(row.reporterUid || '').slice(0, 128),
      reportedId: String(row.reportedId || '').slice(0, 120),
      reportedUid: String(row.reportedUid || '').slice(0, 128),
      reason: String(row.reason || '').slice(0, 180),
      snippet: String(row.snippet || '').slice(0, 200),
      at: row.at || new Date().toISOString(),
    };
    if (!report.reporterId || !report.reportedId || !report.reason) return false;
    rows.push(report);
    if (file) fs.appendFileSync(file, JSON.stringify(report) + '\n');
    if (project) {
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/reports`;
        const r = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHead()) }, body: JSON.stringify({ fields: reportFields(report) }) });
        if (!r.ok) console.error('Firestore reports ' + r.status);
      } catch (err) {
        // The local line is already written. A remote failure must not drop the report.
        console.error('Firestore reports failed:', err.message);
      }
    }
    return report;
  }

  // Reports this player filed stay, with the reporter id replaced by a one-way token.
  // Reports about them are deleted, unless an active ban needs them: those stay, re-keyed to the same token.
  async function retainForDeletion({ accountId, uid, banned, anon }) {
    const names = (id, uidField) => (id && id === accountId) || (uid && uidField && uidField === uid);
    const nextOf = (row) => {
      const submitted = names(row.reporterId, row.reporterUid);
      const about = names(row.reportedId, row.reportedUid);
      if (about && !banned) return null;
      if (!submitted && !about) return row;
      const next = { ...row };
      if (submitted) { next.reporterId = anon; if (next.reporterUid) next.reporterUid = anon; }
      if (about) { next.reportedId = anon; if (next.reportedUid) next.reportedUid = anon; }
      return next;
    };
    rows = rows.map(nextOf).filter(Boolean);
    rewrite();
    if (!project) return rows;
    const headers = await authHead();
    const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
    let page = '';
    do {
      const r = await fetchFn(`${base}/reports?pageSize=300${page ? '&pageToken=' + encodeURIComponent(page) : ''}`, { headers });
      if (!r.ok) throw new Error('Firestore reports list ' + r.status);
      const j = await r.json();
      for (const d of j.documents || []) {
        const row = {
          reporterId: d.fields?.reporterId?.stringValue || '',
          reporterUid: d.fields?.reporterUid?.stringValue || '',
          reportedId: d.fields?.reportedId?.stringValue || '',
          reportedUid: d.fields?.reportedUid?.stringValue || '',
          reason: d.fields?.reason?.stringValue || '',
          snippet: d.fields?.snippet?.stringValue || '',
          at: d.fields?.at?.timestampValue || d.fields?.at?.stringValue || '',
        };
        const next = nextOf(row);
        const name = String(d.name || '');
        const docUrl = name.startsWith('https://') ? name : `https://firestore.googleapis.com/v1/${name.replace(/^\//, '')}`;
        if (!next) {
          const del = await fetchFn(docUrl, { method: 'DELETE', headers });
          if (!del.ok && del.status !== 404) throw new Error('Firestore report delete ' + del.status);
        } else if (next !== row) {
          const patch = await fetchFn(docUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ fields: reportFields(next) }) });
          if (!patch.ok) throw new Error('Firestore report patch ' + patch.status);
        }
      }
      page = j.nextPageToken || '';
    } while (page);
    return rows;
  }
  return { save, allow, list: () => rows.map((r) => ({ ...r })), retainForDeletion };
}

function reportFields(report) {
  return {
    reporterId: { stringValue: report.reporterId },
    reporterUid: { stringValue: report.reporterUid || '' },
    reportedId: { stringValue: report.reportedId },
    reportedUid: { stringValue: report.reportedUid || '' },
    reason: { stringValue: report.reason },
    snippet: { stringValue: report.snippet || '' },
    at: { timestampValue: report.at },
  };
}
