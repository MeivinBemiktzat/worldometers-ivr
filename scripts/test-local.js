// Live test against the real Worldometers site. Run: npm run test:local
// (Requires outbound network access to www.worldometers.info — works from
//  Vercel and from a normal machine; may be blocked in restricted sandboxes.)
import { getCounters } from '../api/_lib/worldometers.js';
import { buildYemotReading } from '../api/_lib/yemot.js';

try {
  const data = await getCounters();
  console.log(`Fetched ${data.count} counters at ${data.fetched_at}`);
  console.log(JSON.stringify(data.counters.slice(0, 10), null, 2));
  console.log('\nYemot (first 5):\n' + buildYemotReading(data.counters, { limit: 5 }));
} catch (err) {
  console.error('Live fetch failed:', err.status || '', err.message);
  process.exit(1);
}
