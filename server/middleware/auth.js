import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { findOwnerId } from '../db/users.js';

/** Signed-in browser session only. Sets req.userId. */
export function requireAuth(req, res, next) {
  if (req.session?.userId) {
    req.userId = req.session.userId;
    return next();
  }
  res.status(401).json({ error: 'Not signed in' });
}

function tokenMatches(given) {
  const expected = config.captureToken;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * For saving new entries: a signed-in session OR the capture token
 * (`Authorization: Bearer <CAPTURE_TOKEN>`), used by the iOS Shortcut.
 * The token only ever unlocks this one route.
 */
export async function requireCaptureAuth(req, res, next) {
  if (req.session?.userId) {
    req.userId = req.session.userId;
    return next();
  }
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (tokenMatches(token)) {
    try {
      req.userId = await findOwnerId();
      if (req.userId) return next();
    } catch (err) {
      return next(err);
    }
  }
  if (req.query.reply === 'text') {
    return res.status(401).type('text').send('✗ Nebula rejected the capture key. Check the Authorization header in the Shortcut.');
  }
  res.status(401).json({ error: 'Not signed in' });
}

/** Wrap async route handlers so thrown errors reach the error handler. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
