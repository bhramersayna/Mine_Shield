// Lightweight in-memory rate limiter & brute-force protection for sensitive endpoints

const loginAttempts = new Map(); // key: ip or username, val: { count: number, firstAttempt: number, lockedUntil: number }

const WINDOW_MS = 15 * 60 * 1000; // 15 minute sliding window
const MAX_ATTEMPTS = 10; // Max attempts per window
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minute lockout upon exceeding limit

function loginRateLimiter(req, res, next) {
  const clientKey = req.ip || req.connection.remoteAddress || "global";
  const now = Date.now();

  const record = loginAttempts.get(clientKey);

  if (record) {
    // Check if client is in lockout
    if (record.lockedUntil && now < record.lockedUntil) {
      const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return res.status(429).json({
        error: `Too many login attempts. Access temporarily restricted. Try again in ${remainingSeconds} seconds.`
      });
    }

    // Reset window if expired
    if (now - record.firstAttempt > WINDOW_MS) {
      record.count = 0;
      record.firstAttempt = now;
      record.lockedUntil = 0;
    }
  }

  // Hook into response to record failed attempts
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    if (res.statusCode === 401 || res.statusCode === 400) {
      const rec = loginAttempts.get(clientKey) || { count: 0, firstAttempt: now, lockedUntil: 0 };
      rec.count += 1;
      if (rec.count >= MAX_ATTEMPTS) {
        rec.lockedUntil = now + LOCKOUT_MS;
      }
      loginAttempts.set(clientKey, rec);
    } else if (res.statusCode === 200) {
      // Clear on success
      loginAttempts.delete(clientKey);
    }
    return originalJson(body);
  };

  next();
}

function resetRateLimits() {
  loginAttempts.clear();
}

module.exports = {
  loginRateLimiter,
  resetRateLimits
};
