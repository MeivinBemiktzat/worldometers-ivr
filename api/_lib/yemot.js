// Build a Yemot "type=api" response body that reads the counters to the caller.
//
// Yemot `id_list_message` syntax:
//   id_list_message=<msg1>.<msg2>.<msg3>...
// Each message is "<type>-<content>":
//   t-<text>   -> read Hebrew text with TTS
//   n-<number> -> read an integer as a spoken number ("מאה עשרים ושלוש")
// Messages are separated by a dot ".", so labels must not contain a dot.
// We chain "&go_to_folder=hangup" so the call ends after the reading.

/**
 * @param {Array<{label:string,value:number|null}>} counters
 * @param {{limit?: number}} [opts]
 * @returns {string} plain-text Yemot response body
 */
export function buildYemotReading(counters, { limit } = {}) {
  let list = counters.filter((c) => c.value !== null);
  if (Number.isInteger(limit) && limit > 0) list = list.slice(0, limit);

  if (list.length === 0) {
    return yemotError('לא נמצאו נתונים להשמעה כרגע.');
  }

  const parts = [];
  for (const c of list) {
    const label = sanitizeLabel(c.label);
    if (label) parts.push(`t-${label}`);
    parts.push(`n-${Math.round(c.value)}`);
    const asOf = sanitizeLabel(c.as_of_text);
    if (asOf) parts.push(`t-${asOf}`);
  }

  return `id_list_message=${parts.join('.')}&go_to_folder=hangup`;
}

/**
 * A spoken error response for the IVR caller (always safe to play).
 * @param {string} message Hebrew message (no dots)
 * @returns {string}
 */
export function yemotError(message) {
  const safe = sanitizeLabel(message) || 'אירעה שגיאה זמנית';
  return `id_list_message=t-${safe}&go_to_folder=hangup`;
}

// Remove characters that would break the id_list_message delimiters.
function sanitizeLabel(text) {
  if (!text) return '';
  return String(text)
    .replace(/[.]/g, ' ') // "." separates messages
    .replace(/[&=]/g, ' ') // reserved by the response syntax
    .replace(/\s+/g, ' ')
    .trim();
}
