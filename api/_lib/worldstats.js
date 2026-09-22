// Core logic: compute live, Worldometer-style world statistics from the
// authoritative World Bank Open Data API (free, no API key, no database).
//
// A fresh request to the World Bank API is made on every call, so the figures
// always reflect the latest official data. The live "ticking" values (per year
// / per day) are projected from the official annual rates using the current
// UTC time — exactly the method Worldometer itself uses.

const WB = 'https://api.worldbank.org/v2/country/WLD/indicator';

// Indicators we read (all world-level, latest available year):
//   SP.POP.TOTL   - total population
//   SP.POP.GROW   - population growth (annual %)
//   SP.DYN.CBRT.IN- crude birth rate (per 1,000 people)
//   SP.DYN.CDRT.IN- crude death rate (per 1,000 people)
const INDICATORS = {
  population: 'SP.POP.TOTL',
  growthPct: 'SP.POP.GROW',
  birthRate: 'SP.DYN.CBRT.IN',
  deathRate: 'SP.DYN.CDRT.IN'
};

const SECONDS_PER_YEAR = 365.2425 * 24 * 3600; // 31,556,952

export class WorldstatsError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'WorldstatsError';
    this.status = status;
  }
}

/**
 * Fetch the indicators and return the structured, live counter list.
 * @param {{timeoutMs?: number, now?: number}} [opts] now = ms epoch (for tests)
 */
export async function getWorldStats({ timeoutMs = 8000, now = Date.now() } = {}) {
  const entries = Object.entries(INDICATORS);
  const results = await Promise.all(
    entries.map(([, code]) => fetchIndicator(code, timeoutMs))
  );

  const data = {};
  entries.forEach(([key], i) => (data[key] = results[i]));

  return buildCounters(data, now);
}

async function fetchIndicator(code, timeoutMs) {
  const url = `${WB}/${code}?format=json&mrnev=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new WorldstatsError(504, 'מקור הנתונים (World Bank) לא הגיב בזמן.');
    }
    throw new WorldstatsError(502, 'לא ניתן להתחבר למקור הנתונים (World Bank).');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new WorldstatsError(502, `מקור הנתונים החזיר שגיאה (קוד ${res.status}).`);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new WorldstatsError(502, 'תשובת מקור הנתונים אינה תקינה.');
  }

  // Expected shape: [ meta, [ { date, value }, ... ] ]
  const row = Array.isArray(json) && Array.isArray(json[1]) ? json[1][0] : null;
  if (!row || row.value == null) {
    throw new WorldstatsError(502, `נתון חסר במקור עבור המדד ${code}.`);
  }
  return { value: Number(row.value), year: row.date };
}

function buildCounters(d, now) {
  const nowSec = now / 1000;

  // Project current population from the latest annual figure using the annual
  // growth rate. World Bank population is a mid-year (≈1 July) estimate.
  const baseYear = Number(d.population.year);
  const baseEpoch = Date.UTC(baseYear, 6, 1) / 1000; // 1 July of the data year
  const g = d.growthPct.value / 100;
  const yearsElapsed = (nowSec - baseEpoch) / SECONDS_PER_YEAR;
  const population = d.population.value * Math.pow(1 + g, yearsElapsed);

  // Per-second flows from the official crude rates (per 1,000 people / year).
  const birthsPerSec = (population * (d.birthRate.value / 1000)) / SECONDS_PER_YEAR;
  const deathsPerSec = (population * (d.deathRate.value / 1000)) / SECONDS_PER_YEAR;
  const growthPerSec = birthsPerSec - deathsPerSec;

  const secToday = secondsSinceMidnightUTC(now);
  const secYear = secondsSinceYearStartUTC(now);

  const popYear = d.population.year;
  const rateYear = d.birthRate.year; // birth & death rates share the same year
  const dRateYear = d.deathRate.year;

  const counters = [
    counter('population_now', 'אוכלוסיית העולם הנוכחית', population, popYear),
    counter('births_today', 'לידות היום', birthsPerSec * secToday, rateYear),
    counter('births_this_year', 'לידות השנה', birthsPerSec * secYear, rateYear),
    counter('deaths_today', 'מקרי מוות היום', deathsPerSec * secToday, dRateYear),
    counter('deaths_this_year', 'מקרי מוות השנה', deathsPerSec * secYear, dRateYear),
    counter('growth_today', 'גידול האוכלוסייה היום', growthPerSec * secToday, rateYear),
    counter('growth_this_year', 'גידול האוכלוסייה השנה', growthPerSec * secYear, rateYear)
  ];

  return {
    source: 'https://data.worldbank.org (World Bank Open Data)',
    fetched_at: new Date(now).toISOString(),
    data_years: {
      population: d.population.year,
      growth: d.growthPct.year,
      birth_rate: d.birthRate.year,
      death_rate: d.deathRate.year
    },
    count: counters.length,
    counters
  };
}

function counter(id, label, rawValue, asOfYear) {
  const value = Math.round(rawValue);
  return {
    id,
    label,
    value,
    value_text: value.toLocaleString('en-US'),
    as_of: asOfYear,
    as_of_text: `מבוסס על נתוני שנת ${asOfYear}`
  };
}

function secondsSinceMidnightUTC(now) {
  const d = new Date(now);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return (now - midnight) / 1000;
}

function secondsSinceYearStartUTC(now) {
  const d = new Date(now);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return (now - yearStart) / 1000;
}
