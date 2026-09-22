// Diagnostic: fetch the live Worldometers page and print how the counters and
// their real values are encoded, so the parser can be matched to reality.
// Run:  node scripts/dump-source.js
const URL = 'https://www.worldometers.info/iw/';
const res = await fetch(URL, {
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'he,en;q=0.8'
  }
});
const html = await res.text();
console.log('HTTP', res.status, 'length', html.length);

// 1) First counter opening tags (attributes reveal how the value is stored).
const tags = [...html.matchAll(/<span[^>]*\brts-counter\b[^>]*>/gi)].slice(0, 6);
console.log('\n=== rts-counter opening tags (first 6) ===');
tags.forEach((t) => console.log(t[0]));

// 2) Full HTML around the first counter (shows number + label markup).
const first = html.search(/<span[^>]*\brts-counter\b[^>]*>/i);
console.log('\n=== HTML around first counter (900 chars) ===');
console.log(html.slice(Math.max(0, first - 200), first + 700));

// 3) Any inline JS data object that feeds the counters.
console.log('\n=== inline counter-data candidates ===');
for (const re of [
  /var\s+rts_counters\s*=\s*[\s\S]{0,400}/i,
  /counters\s*[:=]\s*\{[\s\S]{0,400}/i,
  /rts_[a-zA-Z_]*\s*[:=][\s\S]{0,200}/i
]) {
  const m = re.exec(html);
  if (m) console.log('---\n' + m[0]);
}

// 4) Count how many counters exist total.
console.log(
  '\n=== total rts-counter spans:',
  [...html.matchAll(/\brts-counter\b/gi)].length
);
