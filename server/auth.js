const crypto = require('crypto');

const GATE_PASSWORD = process.env.GATE_PASSWORD || '';
const AUTH_SECRET = process.env.AUTH_SECRET || '';
const COOKIE_NAME = 'gate_auth';

function gateEnabled() {
  return Boolean(GATE_PASSWORD && GATE_PASSWORD.trim());
}

function expectedToken() {
  if (!gateEnabled() || !AUTH_SECRET) return null;
  return crypto.createHmac('sha256', AUTH_SECRET).update(GATE_PASSWORD).digest('hex');
}

function isAuthenticated(req) {
  if (!gateEnabled()) return true;
  const token = expectedToken();
  return Boolean(token && req.cookies?.[COOKIE_NAME] === token);
}

function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  return res.status(401).json({ error: 'Authentication required' });
}

function registerAuthRoutes(app) {
  app.get('/api/auth/status', (req, res) => {
    res.json({ authenticated: isAuthenticated(req), gateEnabled: gateEnabled() });
  });

  app.post('/api/auth/unlock', (req, res) => {
    if (!gateEnabled()) {
      return res.status(503).json({ error: 'Gate password is not configured on the server.' });
    }
    if (!AUTH_SECRET) {
      return res.status(503).json({ error: 'AUTH_SECRET is not configured on the server.' });
    }

    const { password } = req.body || {};
    if (typeof password !== 'string' || password.trim() !== GATE_PASSWORD) {
      return res.status(401).json({ error: 'That key does not fit the lock.' });
    }

    const token = expectedToken();
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    return res.json({ ok: true });
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return res.json({ ok: true });
  });
}

module.exports = {
  registerAuthRoutes,
  requireAuth,
  gateEnabled,
};
