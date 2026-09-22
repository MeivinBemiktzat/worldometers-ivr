// Core logic: fetch the live Worldometers (Hebrew) page and extract every
// counter it currently displays. No database, no cache, no API key.
//
// A fresh HTTP request is made on every call so the numbers always match what
// the site shows at that exact moment (requirement: never reuse stored data).

export const SOURCE_URL = 'https://www.worldometers.info/iw/';

// A small typed error so the HTTP handlers can map failures to the right
// status code and a clear Hebrew message.
export class WorldometersError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'WorldometersError';
    this.status = status;
  }
}

const DEFAULT_TIMEOUT_MS = 8000;

const REQUEST_HEADERS = {
  // A normal browser UA – Worldometers serves the JS-rendered markup either
  // way, and this avoids being treated as an unknown bot.
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'he,en;q=0.8'
};

/**
 * Fetch the page and return the structured counter list.
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<{source:string, fetched_at:string, count:number, counters:Array}>}
 */
export async function getCounters({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const html = await fetchPage(timeoutMs);
  const counters = parseCounters(html);

  if (counters.length === 0) {
    throw new WorldometersError(
      502,
      'לא נמצאו נתונים בעמוד – ייתכן שמבנה האתר של Worldometers השתנה.'
    );
  }

  return {
    source: SOURCE_URL,
    fetched_at: new Date().toISOString(),
    count: counters.length,
    counters
  };
}

async function fetchPage(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(SOURCE_URL, {
      signal: controller.signal,
      headers: REQUEST_HEADERS,
      redirect: 'follow'
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new WorldometersError(
        504,
        'האתר Worldometers לא הגיב בזמן. נסו שוב מאוחר יותר.'
      );
    }
    throw new WorldometersError(
      502,
      'לא ניתן להתחבר לאתר Worldometers כרגע.'
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new WorldometersError(
      502,
      `האתר Worldometers החזיר שגיאה (קוד ${response.status}).`
    );
  }

  return await response.text();
}

/**
 * Extract the counters that the page renders.
 *
 * Worldometers renders each figure inside a `<span class="rts-counter" ...>`
 * element, followed by a Hebrew description element. The number is present in
 * the element (either as its text content or inside its `rel` attribute in the
 * form `absoluteValue:growthPerSecond`). We read the value the page shows and
 * pair it with the nearest following Hebrew label.
 *
 * The parser is intentionally defensive so that a minor markup change on one
 * counter does not break the whole response.
 *
 * @param {string} html
 * @returns {Array<{id:string,label:string,value:number|null,value_text:string}>}
 */
export function parseCounters(html) {
  if (typeof html !== 'string' || html.length === 0) return [];

  // Match the OPENING tag of every counter span (rts-counter class).
  // We do not try to match the closing </span> because the number is often
  // wrapped in nested <span> groups, which defeats naive regex balancing.
  // Group 1 = the opening-tag attributes.
  const primary = /<span([^>]*\brts-counter\b[^>]*)>/gi;
  let matches = [...html.matchAll(primary)];

  // Fallback: markup changed but counters still carry a numeric `rel`
  // attribute of the form "12345:0.98" (absolute value : per-second growth).
  if (matches.length === 0) {
    const fallback = /<span([^>]*\brel="\d[\d.]*:[\d.]+"[^>]*)>/gi;
    matches = [...html.matchAll(fallback)];
  }

  const counters = [];
  const usedIds = new Set();

  for (const m of matches) {
    const attrs = m[1] || '';
    const tagEnd = m.index + m[0].length;

    const value = extractValue(html, tagEnd, attrs);
    const label = extractLabel(html, tagEnd);

    if (value === null && !label) continue; // nothing usable

    const id = makeId(label, counters.length, usedIds);
    counters.push({
      id,
      label: label || `נתון ${counters.length + 1}`,
      value,
      value_text: value === null ? '' : value.toLocaleString('en-US')
    });
  }

  return counters;
}

// Pull the value the page shows: the number that appears right after the
// counter tag and before its (Hebrew) label. If the text is empty (the number
// is injected by JS at runtime), fall back to the load-time value stored in the
// `rel="absolute:growth"` attribute.
function extractValue(html, tagEnd, attrs) {
  const window = stripTags(html.slice(tagEnd, tagEnd + 400));
  const hebIdx = window.search(/[֐-׿]/);
  const head = hebIdx === -1 ? window : window.slice(0, hebIdx);

  const fromText = firstNumber(head);
  if (fromText !== null) return fromText;

  const rel = /\brel="([^"]*)"/i.exec(attrs);
  if (rel && rel[1]) {
    return digitsToNumber(rel[1].split(':')[0]);
  }
  return null;
}

// First run of digits (with optional thousands separators) in a string.
function firstNumber(text) {
  if (!text) return null;
  const m = /\d[\d.,]*/.exec(text.replace(/&nbsp;/g, ' '));
  return m ? digitsToNumber(m[0]) : null;
}

function stripTags(s) {
  return s.replace(/<[^>]*>/g, '');
}

// Convert a displayed number ("7,939,412,300" / "1.234") to a JS number.
function digitsToNumber(text) {
  if (!text) return null;
  const cleaned = text.replace(/&nbsp;/g, ' ').replace(/[^\d.,]/g, '').trim();
  if (!cleaned) return null;
  // Remove thousands separators (commas). Keep a single decimal point.
  const normalized = cleaned.replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

// Find the first Hebrew text label appearing shortly after a counter number.
function extractLabel(html, fromIndex) {
  const window = html.slice(fromIndex, fromIndex + 600);
  // First chunk of text between tags that contains Hebrew letters.
  const re = />\s*([^<>]*[֐-׿][^<>]*?)\s*</g;
  const m = re.exec(window);
  if (!m) return '';
  return cleanText(m[1]);
}

function cleanText(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeId(label, index, used) {
  let base = '';
  if (label) {
    base = label
      .replace(/[֐-׿]/g, '') // drop Hebrew for a URL-safe id
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }
  if (!base) base = `counter_${index + 1}`;
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}_${n++}`;
  used.add(id);
  return id;
}
