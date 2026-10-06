import { pool, newId, now } from './pool.js';

export async function findUserByEmail(email) {
  const [rows] = await pool.query('SELECT id, email, password_hash FROM users WHERE email = ?', [email]);
  return rows[0] || null;
}

export async function findUserById(id) {
  const [rows] = await pool.query('SELECT id, email FROM users WHERE id = ?', [id]);
  return rows[0] || null;
}

export async function createUser(email, passwordHash) {
  const id = newId();
  await pool.query('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)', [
    id,
    email,
    passwordHash,
    now(),
  ]);
  return id;
}

export async function updatePassword(id, passwordHash) {
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
}
