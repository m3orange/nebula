// Turns one parsed email into a plan for Nebula entries.
//
// How you write the email:
//   Subject          -> "why I saved this"
//   #tags            -> tags (in the subject or the body)
//   #watch #read #try #research #reference -> intent
//   #nodash          -> don't put it on the dashboard
//   Attachments      -> one entry each (several = linked as one capture session)
//   Links (no attachments) -> one entry each
//   Links + attachments    -> the first link becomes the attachments' source link
//   Any other text in the body is added to "why I saved this".

const INTENTS = ['watch', 'read', 'try', 'research', 'reference'];
const NO_DASHBOARD = ['nodash', 'nodashboard'];
const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|tiktok\.com|vimeo\.com)$/i;
const ALLOWED_MIME = /^(image|audio|video)\/|^application\/pdf$/;
const SMALL_INLINE_IMAGE = 15 * 1024; // logos and icons in signatures

const HASHTAG = /(^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu;
const URL_RE = /https?:\/\/[^\s<>"'`[\]]+/gi;

function htmlToText(html = '') {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi, ' $1 ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Drop signatures and quoted replies. */
function stripNoise(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (t === '--' || t === '-- ') break; // standard signature separator
    if (/^sent from my (iphone|ipad|mac|android)/i.test(t)) break;
    if (/^on .+wrote:$/i.test(t)) break; // quoted reply
    if (t.startsWith('>')) continue;
    out.push(line);
  }
  return out.join('\n');
}

function cleanUrl(u) {
  const trimmed = u.replace(/[.,;:!?)\]}>]+$/, '');
  try {
    const url = new URL(trimmed);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString().slice(0, 2048) : null;
  } catch {
    return null;
  }
}

function pullHashtags(text, into) {
  return text.replace(HASHTAG, (m, lead, tag) => {
    into.push(tag.toLowerCase());
    return lead;
  });
}

export function contentTypeForLink(url) {
  try {
    return VIDEO_HOSTS.test(new URL(url).hostname) ? 'video' : 'url';
  } catch {
    return 'url';
  }
}

export function contentTypeForMime(mime) {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

/** Email address of the sender, lowercase. */
export function senderOf(parsed) {
  return (parsed.from?.value?.[0]?.address || '').toLowerCase();
}

/** True if the receiving server says the sender's domain failed authentication. */
export function failedAuthentication(parsed) {
  const header = parsed.headers?.get('authentication-results');
  const text = Array.isArray(header) ? header.join(' ') : String(header || '');
  return /\bdmarc=fail\b/i.test(text);
}

/**
 * @param parsed  result of mailparser's simpleParser
 * @returns {{ whySaved, tags, intent, onDashboard, urls, attachments }}
 */
export function planFromEmail(parsed) {
  const hashtags = [];

  let subject = String(parsed.subject || '');
  while (/^\s*(re|fwd?|fw)\s*:/i.test(subject)) subject = subject.replace(/^\s*(re|fwd?|fw)\s*:\s*/i, '');
  let body = parsed.text || htmlToText(typeof parsed.html === 'string' ? parsed.html : '');
  body = stripNoise(body)
    .replace(/\[cid:[^\]]*\]/gi, ' ') // inline-image placeholders
    .replace(/\[\s*(https?:\/\/[^\]\s]+)\s*\]/gi, ' $1 '); // "Link text [https://…]" from HTML emails

  // Links first, so a "#section" inside a URL never becomes a tag.
  const urls = [];
  const addUrl = (u) => {
    const c = cleanUrl(u);
    if (c && !urls.includes(c)) urls.push(c);
  };
  (subject.match(URL_RE) || []).forEach(addUrl);
  (body.match(URL_RE) || []).forEach(addUrl);
  subject = pullHashtags(subject.replace(URL_RE, ' '), hashtags);
  body = pullHashtags(body.replace(URL_RE, ' '), hashtags);

  const intent = hashtags.find((t) => INTENTS.includes(t)) || null;
  const onDashboard = !hashtags.some((t) => NO_DASHBOARD.includes(t));
  const tags = [...new Set(hashtags.filter((t) => !INTENTS.includes(t) && !NO_DASHBOARD.includes(t)))];

  const squash = (s) =>
    s
      .replace(/\[\s*\]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  const why = [squash(subject), squash(body)].filter(Boolean).join('\n\n').slice(0, 2000) || null;

  const attachments = (parsed.attachments || []).filter((a) => {
    const mime = (a.contentType || '').toLowerCase();
    if (!ALLOWED_MIME.test(mime)) return false;
    const inline = a.contentDisposition === 'inline' || a.related;
    if (inline && mime.startsWith('image/') && a.size < SMALL_INLINE_IMAGE) return false;
    return true;
  });

  return { whySaved: why, tags, intent, onDashboard, urls, attachments };
}
