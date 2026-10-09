const { sign, hit, ip } = require('../lib');
module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!process.env.SESSION_SECRET) return res.status(500).json({ error: 'not configured' });
  if (!hit('reg:' + ip(req), 20, 3600e3)) return res.status(429).json({ error: 'slow down' });
  const body = typeof req.body === 'string' ? safe(req.body) : (req.body || {});
  const id = String(body.installId || '').slice(0, 64);
  if (!/^[0-9a-fA-F-]{16,64}$/.test(id)) return res.status(400).json({ error: 'bad id' });
  res.status(200).json({ token: sign({ id, exp: Date.now() + 90 * 86400e3 }) });
};
function safe(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
