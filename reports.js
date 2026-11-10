// Player reports. Always appended to data/reports.jsonl on the game server.
// When FIRESTORE_PROJECT is set, the same row is created in the top-level `reports` collection.
// Clients never read these documents. firestore.rules allows create only.
import fs from 'node:fs';
import path from 'node:path';

export function createReportStore({ dataDir, env = process.env, fetchFn = fetch } = {}) {
  const file = dataDir ? path.join(dataDir, 'reports.jsonl') : null;
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const project = env.FIRESTORE_PROJECT;

  async function save(row) {
    const report = {
      reporterId: String(row.reporterId || '').slice(0, 80),
      reportedId: String(row.reportedId || '').slice(0, 80),
      reason: String(row.reason || '').slice(0, 180),
      snippet: String(row.snippet || '').slice(0, 200),
      at: row.at || new Date().toISOString(),
    };
    if (!report.reporterId || !report.reason) return false;
    if (file) fs.appendFileSync(file, JSON.stringify(report) + '\n');
    if (project) {
      const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/reports`;
      const fields = {
        reporterId: { stringValue: report.reporterId },
        reportedId: { stringValue: report.reportedId },
        reason: { stringValue: report.reason },
        snippet: { stringValue: report.snippet },
        at: { timestampValue: report.at },
      };
      const headers = { 'Content-Type': 'application/json' };
      if (env.FIRESTORE_TOKEN) headers.Authorization = 'Bearer ' + env.FIRESTORE_TOKEN;
      const r = await fetchFn(url, { method: 'POST', headers, body: JSON.stringify({ fields }) });
      if (!r.ok) throw new Error('Firestore reports ' + r.status);
    }
    return report;
  }
  return { save };
}
