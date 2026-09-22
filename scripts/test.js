// Offline test: mocks the World Bank API to verify the counter math and the
// Yemot response format deterministically. Run: npm test
import { getWorldStats } from '../api/_lib/worldstats.js';
import { buildYemotReading, buildYemotNavigation } from '../api/_lib/yemot.js';

// --- mock global fetch with realistic World Bank payloads -----------------
const MOCK = {
  'SP.POP.TOTL': { date: '2025', value: 8215424893 },
  'SP.POP.GROW': { date: '2024', value: 0.9 },
  'SP.DYN.CBRT.IN': { date: '2024', value: 16.2730070969907 },
  'SP.DYN.CDRT.IN': { date: '2024', value: 7.55065418868632 }
};
globalThis.fetch = async (url) => {
  const code = Object.keys(MOCK).find((c) => url.includes(c));
  const body = [
    { page: 1, pages: 1, total: 1 },
    [{ indicator: { id: code }, countryiso3code: 'WLD', ...MOCK[code] }]
  ];
  return { ok: true, status: 200, json: async () => body };
};

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

// Fixed instant: 2026-09-22T12:00:00Z
const now = Date.UTC(2026, 8, 22, 12, 0, 0);
const data = await getWorldStats({ now });
console.log(JSON.stringify(data, null, 2));

const by = Object.fromEntries(data.counters.map((c) => [c.id, c.value]));

// Population projected from 2025 mid-year at 0.9%/yr → ~8.30 billion.
assert(by.population_now > 8.25e9 && by.population_now < 8.35e9, 'population range');
// Births this year > births today > 0, deaths likewise, growth = births-deaths.
assert(by.births_this_year > by.births_today && by.births_today > 0, 'births ordering');
assert(by.deaths_this_year > by.deaths_today && by.deaths_today > 0, 'deaths ordering');
assert(
  Math.abs((by.births_this_year - by.deaths_this_year) - by.growth_this_year) <= 1,
  'growth = births - deaths (year)'
);
// Sanity: crude rates imply ~130M births/yr, ~60M deaths/yr worldwide.
assert(by.births_this_year > 90e6 && by.births_this_year < 160e6, 'births/yr magnitude');
assert(by.deaths_this_year > 40e6 && by.deaths_this_year < 80e6, 'deaths/yr magnitude');

const body = buildYemotReading(data.counters);
console.log('\nYemot body:\n' + body);
// Uses the read action (plays data + captures one key) — no negative overflow.
assert(body.startsWith('read=t-אוכלוסיית העולם הנוכחית.'), 'yemot read prefix');
assert(body.endsWith('=wm_nav,no,1,1,5,Digits,no,no,,,1,Ok'), 'read input spec');
// Large population is read in scale groups, so no n- exceeds 32-bit.
for (const m of body.matchAll(/n-(\d+)/g)) {
  assert(Number(m[1]) < 2147483647, 'each spoken number fits 32-bit: ' + m[1]);
}
assert(body.includes('n-8.t-מיליארד.'), 'population read as billions');
assert(data.counters[0].as_of === '2025', 'population as_of year');
assert(data.counters[1].as_of === '2024', 'births as_of year');
assert((body.match(/מבוסס על נתוני שנת/g) || []).length === 7, 'as-of read for each');

// Navigation: pressing 0 returns to the parent extension, silently.
assert(buildYemotNavigation('0', '3') === 'go_to_folder=/', 'nav 0 from ext 3 -> main');
assert(buildYemotNavigation('0', '1/3') === 'go_to_folder=/1', 'nav 0 from 1/3 -> /1');
assert(buildYemotNavigation('', '3') === 'go_to_folder=hangup', 'no key -> hangup');
assert(buildYemotNavigation('5', '3') === 'go_to_folder=hangup', 'other key -> hangup');

console.log('\nAll assertions passed ✅');
