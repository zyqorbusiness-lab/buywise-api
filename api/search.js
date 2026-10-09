const { verify, hit } = require('../lib');
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
async function resolve(uri) {
  try {
    const r = await fetch(uri, { redirect: 'manual', signal: AbortSignal.timeout(4000) });
    const loc = r.headers.get('location');
    return loc && /^https?:/.test(loc) ? loc : uri;
  } catch (e) { return uri; }
}
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const tok = verify(req.headers['x-install-token']);
  if (!tok) return res.status(401).json({ error: 'auth' });
  if (!hit('sd:' + tok.id, 250, 86400e3) || !hit('sm:' + tok.id, 12, 60e3)) return res.status(429).json({ error: 'busy' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'not configured' });
  let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  const q = b && String(b.query || '').slice(0, 300).trim();
  if (!q) return res.status(400).json({ error: 'bad request' });
  const prompt = 'Search the web for: ' + q + '\nList up to 8 relevant pages. For each give the page title, the site, and one short factual line copied from the page (include price in INR if the page shows one). Do not guess.';
  for (const model of MODELS) {
    let r;
    try {
      r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
        method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }),
        signal: AbortSignal.timeout(40000),
      });
    } catch (e) { continue; }
    if (r.status === 429) return res.status(429).json({ error: 'busy', model });
    if (!r.ok) continue;
    const j = await r.json();
    const c = j.candidates && j.candidates[0]; if (!c) continue;
    const gm = c.groundingMetadata || {};
    const chunks = (gm.groundingChunks || []).map((x) => x.web).filter(Boolean);
    const snip = chunks.map(() => []);
    (gm.groundingSupports || []).forEach((s) => (s.groundingChunkIndices || []).forEach((i) => { if (snip[i] && s.segment && s.segment.text) snip[i].push(s.segment.text); }));
    const urls = await Promise.all(chunks.slice(0, 12).map((w) => resolve(w.uri)));
    const results = chunks.slice(0, 12).map((w, i) => ({ title: w.title || '', url: urls[i], snippet: snip[i].join(' ').slice(0, 400) }));
    const text = ((c.content && c.content.parts) || []).map((p) => p.text || '').join('').slice(0, 3000);
    return res.status(200).json({ results, text, model });
  }
  res.status(502).json({ error: 'search failed' });
};
