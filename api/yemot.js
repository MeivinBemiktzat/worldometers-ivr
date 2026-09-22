// GET /api/yemot
// Endpoint designed to be used directly as the `api_link` of a Yemot
// "type=api" extension. Returns a plain-text response that Yemot reads aloud
// to the caller (Hebrew labels via TTS, numbers spoken in Hebrew).
//
// Optional query params:
//   ?limit=N   read only the first N counters (keeps the call short)
//
// Always answers HTTP 200 with a spoken body, even on failure, so the caller
// hears a clear Hebrew error message instead of silence.

import { getWorldStats, WorldstatsError } from './_lib/worldstats.js';
import { buildYemotReading, yemotError } from './_lib/yemot.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const limit = parseLimit(req.query && req.query.limit);

  try {
    const { counters } = await getWorldStats();
    res.status(200).send(buildYemotReading(counters, { limit }));
  } catch (err) {
    const message =
      err instanceof WorldstatsError
        ? err.message
        : 'אירעה שגיאה בעת חישוב הנתונים.';
    res.status(200).send(yemotError(message));
  }
}

function parseLimit(raw) {
  if (raw == null) return undefined;
  const n = parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
