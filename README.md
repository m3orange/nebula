# Nebula

A personal capture & triage app. Save screenshots, links, audio notes and files from your phone, tag them, say why you saved them, and review them on a morning dashboard alongside your to-dos.

This is **Release 1 + 2**: capture, saving, categorizing, Dashboard v1 and built-in to-dos/reminders.

| | |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind + shadcn/ui (`web/`) |
| Backend | Node.js + Express (`server/`) |
| Database | MySQL / MariaDB (`db/schema.sql`) |
| Files | A folder outside the app: `<UPLOAD_DIR>/<year>/<month>/<id>.<ext>` |
| Hosting | One Hostinger Node.js app serves the API **and** the built React app |

---

## 1. Set up on Hostinger

Hostinger's menus change now and then, so labels below may differ slightly.

### a. Database
1. hPanel → **Databases** → create a MySQL database and user. Note the name, user and password.
2. Open **phpMyAdmin** for that database → **Import** → choose `db/schema.sql` → **Go**.
   You should see 12 tables (`users`, `entries`, `tags`, `tasks`, …).

### b. Uploads folder (outside the app)
GitHub redeploys can replace the app's folder, so uploads must live somewhere else.
1. hPanel → **File Manager** → in your home folder (next to `public_html`, not inside it) create a folder called `nebula-uploads`.
2. Note its full path. It looks like `/home/u123456789/nebula-uploads` (File Manager or the SSH prompt shows your `u…` number).
   If you're not sure what path the Node app can write to, ask Hostinger support: *"What absolute path can my Node.js app write files to that survives redeploys?"*

### c. Node.js app
1. hPanel → **Websites** → your site → **Node.js** (or **Add website → Node.js app**).
2. Connect GitHub and choose the `m3orange/nebula` repository, branch `main`.
3. Settings:
   - **Node version:** 22.x
   - **Framework preset:** Express · **Package manager:** npm
   - The React app builds automatically after `npm install` (a `postinstall` script)
   - **Entry file:** `server/index.js`
4. **Environment variables** (copy the names from `.env.example`):

   | Name | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DB_HOST` | usually `localhost` (hPanel shows it) |
   | `DB_NAME`, `DB_USER`, `DB_PASSWORD` | from step a |
   | `SESSION_SECRET` | a long random string (see below) |
   | `UPLOAD_DIR` | the path from step b |
   | `MAX_UPLOAD_MB` | `100` |

   Generate a session secret on your computer:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
5. Deploy. Visit `https://your-domain/api/health` — it should say `{"ok":true}`.

Every push to `main` redeploys automatically.

### d. Create your login
**Easiest:** open the site. While no account exists, Nebula shows a **Create your account** screen. Fill it in once; after that, sign-up is closed and the screen becomes a normal sign-in.

To reset a forgotten password later, use one of these:

**Option 1 — SSH** (in the app's folder on the server):
```bash
npm run create-user -- you@example.com "a long password"
```
Running it again with the same email resets the password.

**Option 2 — phpMyAdmin**, if you'd rather not use SSH. On your computer, inside this project:
```bash
npm install
node -e "require('bcryptjs').hash(process.argv[1], 12).then(console.log)" "a long password"
```
Then in phpMyAdmin → `users` → **Insert**:
- `id`: any UUID (e.g. from uuidgenerator.net)
- `email`: your email, lowercase
- `password_hash`: the line the command printed (starts with `$2`)
- `created_at`: now, in UTC (e.g. `2026-10-06 15:00:00`)

---

## 2. Put it on your iPhone

1. Open your site in **Safari** and sign in.
2. Share button → **Add to Home Screen**. It opens full-screen like an app.

### Save links from any app's share sheet (optional iOS Shortcut)
Web apps can't appear in the iPhone share sheet, but a Shortcut can open Nebula with the link already filled in:

1. **Shortcuts** app → **+** → name it *Save to Nebula*.
2. Tap the **ⓘ** (details) → turn on **Show in Share Sheet**, accepting **URLs** and **Safari web pages**.
3. Add the action **URL**: `https://your-domain/capture?url=` then insert the **Shortcut Input** variable at the end.
4. Add the action **Open URLs**.

Now *Share → Save to Nebula* from YouTube, TikTok, Safari, etc. opens the capture screen with the link in place. For screenshots, use **Photos & files** inside Nebula (a later release can make the Shortcut upload images too).

---

## 3. Run it on your computer

Needs Node 20+ and a local MySQL or MariaDB.

```bash
cp .env.example .env            # then edit: DB_*, SESSION_SECRET, UPLOAD_DIR=./storage/uploads, NODE_ENV=development
# create a local database and import db/schema.sql
npm install
npm --prefix web install
npm run create-user -- you@example.com "a long password"

npm run dev:api                 # terminal 1 → http://localhost:3000
npm run dev:web                 # terminal 2 → http://localhost:5173 (hot reload, talks to the API)
```

---

## How it's organized

```
db/schema.sql          All tables. Written to move to Postgres (Supabase) later — see the header.
server/
  index.js             Express app: sessions, routes, file serving, serves web/dist
  config.js            Settings from environment variables
  storage.js           Upload handling: <UPLOAD_DIR>/<year>/<month>/<id>.<ext>
  db/                  EVERY database query lives here (the only MySQL-specific code)
  routes/              auth, entries, tags, tasks
  scripts/create-user.js
web/
  src/pages/           dashboard.tsx, capture.tsx, login.tsx
  src/components/      tag-input, entry-card, today-tasks, audio-recorder, form-bits
  src/components/ui/   shadcn/ui components (button, input, switch, …)
  src/lib/api.ts       Typed API client
```

`web/components.json` is set up for the shadcn CLI, so on your computer you can add more components with `npx shadcn@latest add dialog` (from inside `web/`).

### API

| Method | Path | What it does |
|---|---|---|
| POST | `/api/auth/login` · `/logout` · GET `/me` | Sign in/out |
| POST | `/api/entries` | Save (multipart: `files`, `url`, `title`, `whySaved`, `tags` JSON, `intent`, `extractMode`, `transcript`, `saveAs`, `onDashboard`, `listenOnlyOk`) |
| GET | `/api/entries?dashboard=1&tag=&intent=&q=` | List |
| PATCH | `/api/entries/:id` | Hide (`onDashboard:false`), done (`status:"done"`), edit fields/tags |
| GET | `/api/tags?q=` | Tag search; recent first when empty |
| GET/POST/PATCH/DELETE | `/api/tasks` | To-dos and reminders |
| GET | `/files/:assetId` | A saved file (signed-in owner only) |

### Not in this release (by design)
- Copying text from images and transcribing audio: entries are saved with `extract_status = 'pending'`, ready for the background job in Release 3.
- Link previews/titles fetched automatically (YouTube links already show their thumbnail).
- Playlists (R5), morning news (R2.5), Google Calendar and reminder notifications (R4).
- Editing details per item in a batch ("Each item"): batches share one set of details for now.
