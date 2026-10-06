// A small session store backed by the `sessions` table.
import session from 'express-session';
import { pool } from './pool.js';

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export class MySqlSessionStore extends session.Store {
  constructor() {
    super();
    // Clear expired sessions once an hour.
    setInterval(() => {
      pool.query('DELETE FROM sessions WHERE expires_at < ?', [new Date()]).catch(() => {});
    }, 1000 * 60 * 60).unref();
  }

  expiry(sess) {
    const ms = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + DEFAULT_TTL_MS;
    return new Date(ms);
  }

  get(sid, cb) {
    pool
      .query('SELECT data FROM sessions WHERE sid = ? AND expires_at > ?', [sid, new Date()])
      .then(([rows]) => cb(null, rows[0] ? JSON.parse(rows[0].data) : null))
      .catch(cb);
  }

  set(sid, sess, cb) {
    pool
      .query(
        `INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE data = VALUES(data), expires_at = VALUES(expires_at)`,
        [sid, JSON.stringify(sess), this.expiry(sess)],
      )
      .then(() => cb?.(null))
      .catch((err) => cb?.(err));
  }

  touch(sid, sess, cb) {
    pool
      .query('UPDATE sessions SET expires_at = ? WHERE sid = ?', [this.expiry(sess), sid])
      .then(() => cb?.(null))
      .catch((err) => cb?.(err));
  }

  destroy(sid, cb) {
    pool
      .query('DELETE FROM sessions WHERE sid = ?', [sid])
      .then(() => cb?.(null))
      .catch((err) => cb?.(err));
  }
}
