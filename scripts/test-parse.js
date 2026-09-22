// Offline test: verifies the parser + Yemot builder against a fixture that
// mirrors the Worldometers markup. Run: npm run test:parse
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCounters } from '../api/_lib/worldometers.js';
import { buildYemotReading } from '../api/_lib/yemot.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'fixture.html'), 'utf-8');

const counters = parseCounters(html);
console.log('Parsed counters:', JSON.stringify(counters, null, 2));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(counters.length === 4, `expected 4 counters, got ${counters.length}`);
assert(counters[0].value === 8100000123, 'population value from text');
assert(counters[0].label === 'אוכלוסיית העולם הנוכחית', 'population label');
assert(counters[1].value === 72000000, 'births value');
assert(counters[2].value === 30500000, 'deaths value (nested spans)');
assert(counters[3].value === 1250000, 'cars value from rel (empty text)');
assert(counters[3].label === 'מכוניות שיוצרו השנה', 'cars label');

const body = buildYemotReading(counters);
console.log('\nYemot body:\n' + body);
assert(body.startsWith('id_list_message='), 'yemot body prefix');
assert(body.endsWith('&go_to_folder=hangup'), 'yemot body suffix');
assert(body.includes('t-אוכלוסיית העולם הנוכחית.n-8100000123'), 'yemot label+number');
assert(!body.replace('&go_to_folder=hangup', '').includes('&'), 'no stray &');

const limited = buildYemotReading(counters, { limit: 2 });
assert((limited.match(/n-/g) || []).length === 2, 'limit=2 keeps 2 numbers');

console.log('\nAll assertions passed ✅');
