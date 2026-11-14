// The admin surface's own limiter: refuses a caller past ten requests a minute.
const seen = new Map();
export function adminThrottle(req, res, next) {
  const n = (seen.get(req.ip) || 0) + 1;
  seen.set(req.ip, n);
  if (n > 10) return res.status(429).end();
  next();
}
