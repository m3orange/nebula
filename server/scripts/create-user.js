// Create your login, or reset its password:
//   npm run create-user -- you@example.com "a long password"
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { createUser, findUserByEmail, updatePassword } from '../db/users.js';

const [emailArg, password] = process.argv.slice(2);
const email = String(emailArg || '').trim().toLowerCase();

if (!email || !password) {
  console.error('Usage: npm run create-user -- you@example.com "a long password"');
  process.exit(1);
}
if (password.length < 12) {
  console.error('Use a password of at least 12 characters.');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
const existing = await findUserByEmail(email);
if (existing) {
  await updatePassword(existing.id, hash);
  console.log(`Password updated for ${email}`);
} else {
  await createUser(email, hash);
  console.log(`User created: ${email}`);
}
await pool.end();
