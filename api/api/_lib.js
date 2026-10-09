const crypto = require('crypto');
const SECRET = () => process.env.SESSION_SECRET || '';
const b64 = (b) => Buffer.from(b).toString('base64url');
function sign(payload) {
  const body = b64(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url');
  return body + '.' + sig;
}
function verify(token) {
  if (!token || !SECRET()) return null;
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const exp = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(exp);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch (e) { return null; }
}
// best-effort in-memory counters (per warm instance); real protection is the token + caps below
const buckets = new Map();
function hit(key, limit, windowMs) {
  const now = Date.now();
  const b = buckets.get(key) || { n: 0, t: now };
  if (now - b.t > windowMs) { b.n = 0; b.t = now; }
  b.n++; buckets.set(key, b);
  if (buckets.size > 5000) buckets.clear();
  return b.n <= limit;
}
const ip = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
module.exports = { sign, verify, hit, ip };
