const buckets = new Map();

function rateLimit({ windowMs = 60_000, max = 3} = {}) {
  return (req, res, next) => {
    const key = `${req.body?.userId || req.query?.userId || req.ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const bucket = (buckets.get(key) || []).filter(time => now - time < windowMs);
    if (bucket.length >= max) return res.status(429).json({ message: 'Too many requests. Please try again shortly.' });
    bucket.push(now);
    buckets.set(key, bucket);
    next();
  };
}
module.exports = { rateLimit };
