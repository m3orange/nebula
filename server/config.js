// All settings come from environment variables (see .env.example).
// On Hostinger, set them in the Node.js app's environment settings.
import path from 'node:path';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See .env.example.`);
  }
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  isProduction,
  port: Number(process.env.PORT || 3000),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD || '',
    database: required('DB_NAME'),
  },

  sessionSecret: required('SESSION_SECRET'),

  // Absolute path OUTSIDE the app folder, so redeploys never wipe your files.
  // Example on Hostinger: /home/u123456789/nebula-uploads
  uploadDir: path.resolve(process.env.UPLOAD_DIR || './storage/uploads'),

  // Largest single file accepted, in MB (long audio notes need room).
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 100),
};
