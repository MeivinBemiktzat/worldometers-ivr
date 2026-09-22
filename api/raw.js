// TEMPORARY diagnostic endpoint (will be removed once the parser is finalized).
// Fetches the RTS init.php that feeds the Worldometers counters and returns its
// raw response, so we can see the exact data structure. Runs server-side on
// Vercel, which is not behind the caller's content filter.
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const now = Date.now();
  const url =
    'https://www.realtimestatistics.net/rts/init.php' +
    `?callback=jsoncallback&host=worldometers&time=${now}&_=${now}`;

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.worldometers.info/',
        'Accept': '*/*'
      }
    });
    const body = await r.text();
    res.status(200).send(
      `HTTP ${r.status}\nURL ${url}\nLENGTH ${body.length}\n` +
        `======= RAW BODY (first 8000 chars) =======\n` +
        body.slice(0, 8000)
    );
  } catch (err) {
    res.status(200).send('FETCH ERROR: ' + (err && err.message));
  }
}
