// GET /api/worldometers
// Returns a clean JSON snapshot of live, Worldometer-style world statistics,
// computed from the authoritative World Bank Open Data API on every request
// (no caching, no database, no API key).

import { getWorldStats, WorldstatsError } from './_lib/worldstats.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    const data = await getWorldStats();
    res.status(200).json({ ok: true, ...data });
  } catch (err) {
    const status = err instanceof WorldstatsError ? err.status : 500;
    const message =
      err instanceof WorldstatsError
        ? err.message
        : 'שגיאה פנימית בעת חישוב הנתונים.';
    res.status(status).json({ ok: false, error: message });
  }
}
