// Build Yemot "type=api" response bodies that read the counters to the caller.
//
// Message syntax (shared by id_list_message and read):
//   <msg1>.<msg2>...   — messages separated by "."
//   t-<text>           — read Hebrew text (TTS)
//   n-<number>         — read an integer as a spoken Hebrew number
//
// IMPORTANT: Yemot reads n-<number> as a 32-bit integer, so any value
// >= 2,147,483,647 overflows (e.g. 8.3 billion is heard as a negative number).
// We therefore read large numbers in scale groups (billion / million / thousand),
// each group being < 1000, which is always safe and also clearer by phone.

const SCALES = [
  [1000000000, 'מיליארד'],
  [1000000, 'מיליון'],
  [1000, 'אלף']
];

// Turn a number into a list of Yemot messages, e.g.
// 8,307,457,604 -> ["n-8","t-מיליארד","n-307","t-מיליון","n-457","t-אלף","n-604"]
function spokenNumberMessages(value) {
  let n = Math.round(Number(value));
  if (!Number.isFinite(n)) return ['n-0'];
  const neg = n < 0;
  if (neg) n = -n;

  const parts = [];
  for (const [factor, word] of SCALES) {
    const q = Math.floor(n / factor);
    if (q > 0) {
      parts.push(`n-${q}`, `t-${word}`);
      n -= q * factor;
    }
  }
  if (n > 0 || parts.length === 0) parts.push(`n-${n}`);
  if (neg) parts.unshift('t-מינוס');
  return parts;
}

// Build the "." joined message list for a set of counters (label, number, as-of).
function buildMessages(counters, { limit } = {}) {
  let list = counters.filter((c) => c.value != null);
  if (Number.isInteger(limit) && limit > 0) list = list.slice(0, limit);
  if (list.length === 0) return '';

  const parts = [];
  for (const c of list) {
    const label = sanitizeLabel(c.label);
    if (label) parts.push(`t-${label}`);
    parts.push(...spokenNumberMessages(c.value));
    const asOf = sanitizeLabel(c.as_of_text);
    if (asOf) parts.push(`t-${asOf}`);
  }
  return parts.join('.');
}

/**
 * Play all counters and let the caller press a key.
 * The `read` action collects one digit (navParam). Pressing "0" is handled by
 * the server on the follow-up request (go back one extension); no press ends
 * the reading and the call hangs up. No message is played on navigation.
 *
 * @param {Array} counters
 * @param {{limit?: number, navParam?: string, timeoutSec?: number}} [opts]
 * @returns {string} plain-text Yemot response body
 */
export function buildYemotReading(counters, { limit, navParam = 'wm_nav', timeoutSec = 5 } = {}) {
  const msgs = buildMessages(counters, { limit });
  if (!msgs) return yemotError('לא נמצאו נתונים להשמעה כרגע.');

  // read second part (input spec), field order per Yemot API docs:
  // name, confirm, maxDigits, minDigits, timeout, type, blockStar, blockZero,
  // replaceKeys, allowedKeys, replayCount, onEmpty
  //   allowedKeys empty  -> any key accepted (we route on the value ourselves)
  //   onEmpty = Ok        -> if nothing pressed, proceed (server then hangs up)
  const input = `${navParam},no,1,1,${timeoutSec},Digits,no,no,,,1,Ok`;
  return `read=${msgs}=${input}`;
}

/**
 * Response for the navigation follow-up request (after read collected a digit).
 * "0" -> return to the previous (parent) extension, silently.
 * anything else / empty -> hang up.
 * @param {string} digit the collected value
 * @param {string} currentExtension Yemot ApiExtension value (e.g. "3" or "1/3")
 */
export function buildYemotNavigation(digit, currentExtension) {
  if (String(digit).trim() === '0') {
    return `go_to_folder=${parentExtension(currentExtension)}`;
  }
  return 'go_to_folder=hangup';
}

/**
 * A spoken error response for the IVR caller (always safe to play).
 * @param {string} message Hebrew message (no dots)
 */
export function yemotError(message) {
  const safe = sanitizeLabel(message) || 'אירעה שגיאה זמנית';
  return `id_list_message=t-${safe}&go_to_folder=hangup`;
}

// The extension one level up from the current API extension.
// "3" -> "/", "1/3" -> "/1", missing -> "/".
function parentExtension(ext) {
  const parts = String(ext || '')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
  parts.pop();
  return parts.length ? '/' + parts.join('/') : '/';
}

// Remove characters that would break the message delimiters.
function sanitizeLabel(text) {
  if (!text) return '';
  return String(text)
    .replace(/[.]/g, ' ') // "." separates messages
    .replace(/[&=]/g, ' ') // reserved by the response syntax
    .replace(/\s+/g, ' ')
    .trim();
}
