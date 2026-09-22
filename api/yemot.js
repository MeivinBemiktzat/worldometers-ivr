// GET /api/yemot
// Endpoint designed to be used directly as the `api_link` of a Yemot
// "type=api" extension.
//
// Flow:
//   1. First entry  -> play all counters via `read` (also waits for one key).
//   2. Follow-up     -> Yemot re-calls this URL with the pressed key (wm_nav):
//                        "0"  -> go back to the previous (parent) extension (silent)
//                        else -> hang up.
//
// Optional query params:
//   ?limit=N   read only the first N counters (keeps the call short)
//
// Always answers HTTP 200 with a plain-text body.

import { getWorldStats, WorldstatsError } from './_lib/worldstats.js';
import { buildYemotReading, buildYemotNavigation, yemotError } from './_lib/yemot.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const params = parseYemotParams(req);

  // Navigation follow-up: Yemot appended the collected key (wm_nav).
  if ('wm_nav' in params) {
    res.status(200).send(buildYemotNavigation(params.wm_nav, params.ApiExtension));
    return;
  }

  const limit = parseLimit(params.limit);

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

// Yemot sends parameters as key^value pairs joined by "*" (and standard query
// params use key=value joined by "&"). Parse both tolerantly.
function parseYemotParams(req) {
  const q = (req.url || '').split('?')[1] || '';
  const out = {};
  for (const pair of q.split(/[*&]/)) {
    if (!pair) continue;
    const sep = pair.includes('^') ? '^' : pair.includes('=') ? '=' : null;
    if (!sep) continue;
    const idx = pair.indexOf(sep);
    const k = safeDecode(pair.slice(0, idx));
    const v = safeDecode(pair.slice(idx + 1));
    if (k) out[k] = v;
  }
  return out;
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function parseLimit(raw) {
  if (raw == null) return undefined;
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
