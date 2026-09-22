// Diagnostic step 2: the counter numbers are NOT in the page HTML — they are
// loaded by realtimestatistics.net's RTSp.js using RTS_key 'worldometers'.
// This script fetches RTSp.js so we can see the data endpoint + value formula.
// Run:  node scripts/dump-source.js   (from a machine with internet)
import { writeFileSync } from 'node:fs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function grab(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const body = await res.text();
  console.log(`\n===== ${url}\nHTTP ${res.status}  length ${body.length}`);
  return body;
}

// 1) The RTS player script.
const js = await grab('https://www.realtimestatistics.net/rts/RTSp.js');
writeFileSync('RTSp.js', js);
console.log(js.slice(0, 4000));
console.log('\n... (full script saved to RTSp.js — please upload that file) ...');

// 2) Show any URLs the script references (likely the data endpoint).
console.log('\n=== URLs / endpoints referenced in RTSp.js ===');
for (const m of js.matchAll(/["'`](https?:)?\/\/[^"'`]+|["'`]\/[a-zA-Z0-9_\/.\-]+/g)) {
  console.log(m[0]);
}
