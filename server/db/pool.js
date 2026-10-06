// The one place that knows we're on MySQL. Every query in the app lives in
// this db/ folder, so moving to Postgres later only means changing these files.
import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 5,
  timezone: 'Z',        // read and write DATETIME values as UTC
  charset: 'utf8mb4',
});

export const newId = () => randomUUID();
export const now = () => new Date();

/** Run several queries in one transaction. */
export async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
