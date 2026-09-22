// GET /api/worldometers
// Returns a clean JSON snapshot of every counter Worldometers currently shows.
// A fresh request to the source is made on every call (no caching).

import { getCounters, WorldometersError } from './_lib/worldometers.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    const data = await getCounters();
    res.status(200).json({ ok: true, ...data });
  } catch (err) {
    const status = err instanceof WorldometersError ? err.status : 500;
    const message =
      err instanceof WorldometersError
        ? err.message
        : 'שגיאה פנימית בעת קריאת הנתונים.';
    res.status(status).json({ ok: false, error: message });
  }
}
