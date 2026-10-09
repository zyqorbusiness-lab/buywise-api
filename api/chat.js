const { verify, hit } = require('../lib');
const MODELS = {
  fast: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'],
  smart: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'],
  smart2: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'],
};
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const tok = verify(req.headers['x-install-token']);
  if (!tok) return res.status(401).json({ error: 'auth' });
  if (!hit('d:' + tok.id, 600, 86400e3)) return res.status(429).json({ error: 'daily limit for this install' });
  if (!hit('m:' + tok.id, 40, 60e3)) return res.status(429).json({ error: 'too fast' });
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(500).json({ error: 'not configured' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || !Array.isArray(b.messages) || b.messages.length < 1 || b.messages.length > 6) return res.status(400).json({ error: 'bad request' });
  const msgs = b.messages.map((m) => ({ role: m.role === 'system' ? 'system' : 'user', content: String(m.content || '').slice(0, 40000) }));
  if (JSON.stringify(msgs).length > 60000) return res.status(413).json({ error: 'too large' });
  const list = MODELS[b.tier] || MODELS.fast;
  let lastErr = 'unknown', status = 502;
  for (const model of list) {
    for (const withJson of b.json ? [true, false] : [false]) {
      const payload = { model, messages: msgs, temperature: 0.2, max_tokens: 2800 };
      if (withJson) payload.response_format = { type: 'json_object' };
      let r;
      try {
        r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
      } catch (e) { lastErr = 'network'; continue; }
      const text = await r.text();
      if (r.ok) {
        try {
          const j = JSON.parse(text);
          const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
          if (content) return res.status(200).json({ content, model });
        } catch (e) {}
        lastErr = 'empty'; continue;
      }
      status = r.status; lastErr = 'upstream ' + r.status;
      if (r.status === 429) return res.status(429).json({ error: 'busy' });
      if (r.status === 401 || r.status === 403) return res.status(502).json({ error: 'provider auth' });
      // 400/404 (json mode or model unsupported): try next variant
    }
  }
  res.status(status === 429 ? 429 : 502).json({ error: lastErr });
};
