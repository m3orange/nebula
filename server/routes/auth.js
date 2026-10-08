import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { countUsers, createUser, findUserByEmail, findUserById } from '../db/users.js';
import { wrap } from '../middleware/auth.js';

const router = Router();

// At most 10 login attempts per 15 minutes from one address.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

router.post(
  '/login',
  loginLimiter,
  wrap(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const user = email ? await findUserByEmail(email) : null;
    const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!ok) return res.status(401).json({ error: 'Email or password is incorrect' });

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Could not start session' });
      req.session.userId = user.id;
      res.json({ id: user.id, email: user.email });
    });
  }),
);

// First-run setup: while the users table is empty, the app offers to create the
// owner account. Once one user exists, these routes refuse, so nobody else can sign up.
router.get(
  '/setup',
  wrap(async (req, res) => {
    res.json({ needsSetup: (await countUsers()) === 0 });
  }),
);

router.post(
  '/setup',
  loginLimiter,
  wrap(async (req, res) => {
    if ((await countUsers()) > 0) return res.status(403).json({ error: 'Setup is already complete' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
    if (password.length < 12) return res.status(400).json({ error: 'Use a password of at least 12 characters' });

    const id = await createUser(email, await bcrypt.hash(password, 12));
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Account created, but could not sign in. Try signing in.' });
      req.session.userId = id;
      res.status(201).json({ id, email });
    });
  }),
);

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('capture.sid');
    res.json({ ok: true });
  });
});

router.get(
  '/me',
  wrap(async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Not signed in' });
    const user = await findUserById(req.session.userId);
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    res.json(user);
  }),
);

export default router;
