// Where uploaded files live: <UPLOAD_DIR>/<year>/<month>/<asset-id>.<ext>
// The database only stores the relative part ("2026/10/<id>.png"), so moving
// files to another disk or cloud storage later means changing UPLOAD_DIR only.
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from './config.js';
import { newId } from './db/pool.js';

const ALLOWED = /^(image|audio|video)\/|^application\/pdf$|^text\/plain$/;

function safeExtension(originalName, mimeType) {
  const fromName = path.extname(originalName || '').toLowerCase();
  if (/^\.[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  const fromMime = (mimeType || '').split('/')[1]?.replace(/[^a-z0-9]/g, '');
  return fromMime ? `.${fromMime.slice(0, 8)}` : '';
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const d = new Date();
    const rel = path.join(String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, '0'));
    const abs = path.join(config.uploadDir, rel);
    fs.mkdir(abs, { recursive: true }, (err) => cb(err, abs));
  },
  filename(req, file, cb) {
    file.assetId = newId();
    cb(null, file.assetId + safeExtension(file.originalname, file.mimetype));
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 20 },
  fileFilter(req, file, cb) {
    if (ALLOWED.test(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error(`File type not supported: ${file.mimetype}`), { status: 415 }));
  },
});

/** multer file -> the shape stored in entry_assets. */
export function toAsset(file) {
  return {
    id: file.assetId,
    path: path.relative(config.uploadDir, file.path).split(path.sep).join('/'),
    originalName: file.originalname?.slice(0, 255) || null,
    mimeType: file.mimetype,
    sizeBytes: file.size,
  };
}

/**
 * Save an in-memory file (e.g. an email attachment) the same way uploads are
 * saved. Returns the entry_assets shape, or null if the type isn't allowed.
 */
export async function saveBuffer(buffer, originalName, mimeType) {
  if (!ALLOWED.test(mimeType || '')) return null;
  if (buffer.length > config.maxUploadMb * 1024 * 1024) {
    throw Object.assign(new Error(`${originalName || 'Attachment'} is larger than ${config.maxUploadMb} MB`), {
      status: 413,
    });
  }
  const d = new Date();
  const rel = path.join(String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, '0'));
  await fs.promises.mkdir(path.join(config.uploadDir, rel), { recursive: true });
  const id = newId();
  const relPath = path.join(rel, id + safeExtension(originalName, mimeType));
  await fs.promises.writeFile(path.join(config.uploadDir, relPath), buffer);
  return {
    id,
    path: relPath.split(path.sep).join('/'),
    originalName: originalName?.slice(0, 255) || null,
    mimeType,
    sizeBytes: buffer.length,
  };
}

/** Absolute path for a stored relative path, refusing anything that escapes UPLOAD_DIR. */
export function absolutePath(relPath) {
  const abs = path.resolve(config.uploadDir, relPath);
  if (!abs.startsWith(config.uploadDir + path.sep)) throw new Error('Invalid file path');
  return abs;
}

/** Remove files from a request that failed, so nothing is left orphaned. */
export function discardFiles(files = []) {
  for (const f of files) fs.unlink(f.path, () => {});
}

/** Remove saved assets (relative paths) after a failed save. */
export function discardAssets(assets = []) {
  for (const a of assets) fs.unlink(path.join(config.uploadDir, a.path), () => {});
}
