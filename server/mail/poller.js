// Checks the capture mailbox and turns new emails into Nebula entries.
// Each email ends up in one of three folders, so nothing is processed twice:
//   "Nebula Processed"  saved as entries
//   "Nebula Rejected"   not from an allowed sender (or failed authentication)
//   "Nebula Failed"     something went wrong; the reason is logged
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { config } from '../config.js';
import { transaction } from '../db/pool.js';
import { createSession, insertEntry } from '../db/entries.js';
import { findOwnerId } from '../db/users.js';
import { discardAssets, saveBuffer } from '../storage.js';
import { contentTypeForLink, contentTypeForMime, failedAuthentication, planFromEmail, senderOf } from './parse.js';

const FOLDERS = { done: 'Nebula Processed', rejected: 'Nebula Rejected', failed: 'Nebula Failed' };
const MAX_PER_RUN = 25;

let running = null;
let lastRun = null;

/** Save one parsed email as entries. Returns how many entries were created. */
export async function saveEmail(parsed, userId) {
  const plan = planFromEmail(parsed);
  const assets = [];
  try {
    for (const a of plan.attachments) {
      const asset = await saveBuffer(a.content, a.filename || 'attachment', a.contentType.toLowerCase());
      if (asset) assets.push(asset);
    }

    const base = {
      whySaved: plan.whySaved,
      intent: plan.intent,
      onDashboard: plan.onDashboard,
      listenOnlyOk: false,
      extractMode: 'text',
    };

    return await transaction(async (conn) => {
      if (assets.length > 0) {
        const sessionId = assets.length > 1 ? await createSession(conn, userId, 'Email') : null;
        for (const asset of assets) {
          await insertEntry(
            conn,
            userId,
            { ...base, sessionId, sourceUrl: plan.urls[0] || null, contentType: contentTypeForMime(asset.mimeType) },
            [asset],
            plan.tags,
          );
        }
        return assets.length;
      }
      if (plan.urls.length > 0) {
        const sessionId = plan.urls.length > 1 ? await createSession(conn, userId, 'Email') : null;
        for (const url of plan.urls) {
          await insertEntry(
            conn,
            userId,
            { ...base, sessionId, sourceUrl: url, contentType: contentTypeForLink(url), extractMode: 'none' },
            [],
            plan.tags,
          );
        }
        return plan.urls.length;
      }
      if (plan.whySaved) {
        await insertEntry(conn, userId, { ...base, contentType: 'note', extractMode: 'none' }, [], plan.tags);
        return 1;
      }
      return 0;
    });
  } catch (err) {
    discardAssets(assets);
    throw err;
  }
}

/**
 * Make sure the three folders exist and return their real paths. Some servers
 * keep every folder under INBOX (e.g. "INBOX.Nebula Processed"), so we look
 * them up by name after creating them.
 */
async function ensureFolders(client) {
  const find = (list, name) => list.find((m) => m.name === name || m.path === name)?.path;
  let list = await client.list();
  for (const name of Object.values(FOLDERS)) {
    if (!find(list, name)) {
      try {
        await client.mailboxCreate(name);
      } catch {
        // Some servers only allow folders under INBOX.
        const delimiter = list.find((m) => m.path === 'INBOX')?.delimiter || '.';
        await client.mailboxCreate(`INBOX${delimiter}${name}`).catch(() => {});
      }
    }
  }
  list = await client.list();
  const paths = {};
  for (const [key, name] of Object.entries(FOLDERS)) {
    paths[key] = find(list, name);
    if (!paths[key]) throw new Error(`Could not create the mail folder "${name}"`);
  }
  return paths;
}

async function runCheck() {
  const mail = config.mail;
  const summary = { checkedAt: new Date().toISOString(), emails: 0, entries: 0, rejected: 0, failed: 0, errors: [] };
  if (!mail) throw Object.assign(new Error('Email capture is not configured (MAIL_USER is empty)'), { status: 400 });
  if (mail.allowedFrom.length === 0) {
    throw Object.assign(new Error('MAIL_ALLOWED_FROM is empty, so every email would be rejected'), { status: 400 });
  }

  const userId = await findOwnerId();
  if (!userId) throw new Error('No Nebula account exists yet');

  const client = new ImapFlow({
    host: mail.host,
    port: mail.port,
    secure: mail.secure,
    auth: { user: mail.user, pass: mail.password },
    logger: false,
  });
  try {
    await client.connect();
  } catch (err) {
    const why = err.authenticationFailed
      ? `Mailbox login failed for ${mail.user}. Check MAIL_USER and MAIL_PASSWORD.`
      : `Can't reach the mail server ${mail.host}:${mail.port} (${err.code || err.message}). Check MAIL_IMAP_HOST and MAIL_IMAP_PORT.`;
    throw Object.assign(new Error(why), { status: 502 });
  }
  try {
    const folders = await ensureFolders(client);
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = ((await client.search({ seen: false }, { uid: true })) || []).slice(0, MAX_PER_RUN);
      for (const uid of uids) {
        summary.emails += 1;
        let target = folders.done;
        try {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
          const parsed = await simpleParser(msg.source);
          const from = senderOf(parsed);
          if (!mail.allowedFrom.includes(from) || failedAuthentication(parsed)) {
            target = folders.rejected;
            summary.rejected += 1;
          } else {
            const n = await saveEmail(parsed, userId);
            if (n === 0) {
              target = folders.failed;
              summary.failed += 1;
              summary.errors.push(`"${parsed.subject || '(no subject)'}": nothing to save`);
            } else {
              summary.entries += n;
            }
          }
        } catch (err) {
          target = folders.failed;
          summary.failed += 1;
          summary.errors.push(err.message);
          console.error('[mail] failed to save an email:', err.message);
        }
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
        await client.messageMove(String(uid), target, { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  if (summary.emails) console.log(`[mail] ${summary.emails} email(s): ${summary.entries} entries, ${summary.rejected} rejected, ${summary.failed} failed`);
  return summary;
}

/** Check the mailbox now. If a check is already running, waits for it instead of starting another. */
export function checkMailbox() {
  if (!running) {
    running = runCheck()
      .then((s) => (lastRun = s))
      .finally(() => {
        running = null;
      });
  }
  return running;
}

export function lastMailCheck() {
  return lastRun;
}

/** Check every MAIL_POLL_MINUTES while the server runs (first check shortly after startup). */
export function startMailPoller() {
  if (!config.mail) return;
  const tick = () =>
    checkMailbox().catch((err) => {
      lastRun = { checkedAt: new Date().toISOString(), error: err.message };
      console.error('[mail] check failed:', err.message);
    });
  setTimeout(tick, 20 * 1000).unref();
  setInterval(tick, config.mail.pollMinutes * 60 * 1000).unref();
  console.log(`[mail] checking ${config.mail.user} every ${config.mail.pollMinutes} min`);
}
