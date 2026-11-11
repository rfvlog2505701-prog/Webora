# Webora 3.0 — upgrade notes

Everything from 2.0 still works (login/register/OTP, dashboard, `/api/publish` Developer API, API keys,
existing site URLs, 3-site limit, ads on API-published sites). Old single-file sites keep serving exactly as before.

## New files
| Path | Purpose |
|---|---|
| `studio.html`, `assets/studio.js`, `assets/studio.css` | Multi-file Studio: explorer, tabs, CodeMirror editor, preview, autosave, versions, AI drawer, publish |
| `assets/preview.js` | Builds the sandboxed preview (resolves local CSS/JS/images/fonts/JSON) |
| `assets/zip.js`, `assets/fileutil.js`, `assets/api.js` | Safe ZIP import/export, client validation, authenticated API client |
| `assets/aigen.js`, `ai.html` | AI Website Generator UI |
| `analytics.html`, `assets/analytics-page.js` | Analytics dashboard |
| `assets/boot.js`, `assets/fx.js`, `assets/anim-icons.js` | Animated W-logo loader, particles/scroll bar/reveal effects, animated orbit icons |
| `api/projects.js` | Projects / files / versions / publish (one function, `action`-based) |
| `api/ai.js` | Server-side AI endpoint (key never reaches the browser) |
| `api/track.js`, `api/analytics.js` | Privacy-friendly collector + owner-only stats |
| `lib/projects.js` | Path/type/size validation shared by the server |

Changed: `assets/style.css` (new theme), `assets/layout.js`, `api/site.js` (serves multi-file sites + tracker),
`api/publish.js` (guards multi-file sites, cleans up on delete), `vercel.json` (`/:username/:path*` rewrite, AI timeout),
`index/dashboard/create/login/register/api-key/api-docs/edit.html` (new look).
Vercel function count is 11 (Hobby limit is 12).

## Environment variables
Unchanged: `FIREBASE_*`, `CLOUDNEST_API_KEY`, `PUBLIC_DOMAIN`. Optional new: `ANALYTICS_SALT` (any random string),
`GEMINI_API_KEY` / `GEMINI_MODEL` (fallback only — normally set from the Admin Panel).

## AI key / model (Admin Panel contract)
`/api/ai` reads, server-side only, `adminConfig/ai` from Realtime Database:
`{ "apiKey": "<Google AI Studio key>", "model": "<model id>", "enabled": true, "maxOutputTokens": 32768 }`.
The Admin Panel only has to write that node. Nothing about it is ever returned to browsers.
Per-user limit: 10 generations / hour.

## Database rules (important)
All new data is read/written **only by the server (Admin SDK)**. Keep these nodes closed to browsers:
```json
{ "rules": {
  "projects": {".read": false, ".write": false},
  "projectFiles": {".read": false, ".write": false},
  "projectVersions": {".read": false, ".write": false},
  "projectVersionFiles": {".read": false, ".write": false},
  "sitesFiles": {".read": false, ".write": false},
  "analytics": {".read": false, ".write": false},
  "aiUsage": {".read": false, ".write": false},
  "adminConfig": {".read": false, ".write": false}
  /* keep your existing rules for users/, sitesPublic/, etc. */
}}
```

## Data model
`projects/{uid}/{pid}` meta · `projectFiles/{uid}/{pid}/{fileKey}` **draft** · `projectVersions…` snapshots ·
`sitesFiles/{siteKey}/{fileKey}` **published** files · `sitesPublic/{siteKey}` (existing record, now with `multi:true`).
Draft and published are separate: only the *Publish* action copies draft → live.

## Limits
300 files, 2.5 MB/file, 8 MB/project, 25 versions/project, 15 projects/user, ZIP ≤ 25 MB / 1500 entries.
Allowed types: html htm css js mjs json txt md xml svg webmanifest csv map png jpg jpeg gif webp avif bmp ico woff woff2 ttf otf eot mp3 wav ogg mp4 webm pdf.

## Notes
* Editor/ZIP/formatter libraries load from cdnjs (CodeMirror 5.65.16, JSZip 3.10.1, js-beautify 1.15.1). If the CDN is unreachable the Studio falls back to a plain-text editor.
* ZIPs are inspected in the browser **and every file is re-validated on the server** (path traversal, hidden files, type, size, base64).
* Analytics days are UTC; unique visitors are per-day (rotating salted hash, hashes deleted after 2 days; no IP/UA stored).
* A published multi-file site can't be changed through the old `/api/publish` update (returns 409) — use Studio.

---

## 3.1 — this round of changes (unlimited sites, pretty URLs, light theme, AI streaming, env vars, hybrid API, mobile)

**No new serverless functions were added** — still 11 (Hobby limit is 12). `api/ai.js`'s `maxDuration`
was raised to 300s in `vercel.json`; **this needs a Vercel plan/infra that allows functions longer than
60s** (Pro, or Hobby with Fluid Compute). If deploys fail on `maxDuration`, lower it back toward 60 and
the code still works — streaming generation will just have less time before timing out.

- **Unlimited websites** — removed the 3-site cap (`api/projects.js`, `api/publish.js`) and the
  15-project cap (`lib/projects.js`, now `Infinity`). Per-file/per-project **size** limits were kept
  (300 files, 2.5 MB/file, ~18 MB/project) — those protect a single request from exceeding Vercel's
  body-size limit, they aren't a "how many sites" restriction.
- **Pretty URLs** — `/login.html` → `/auth/login`, `/dashboard.html` → `/app/dashboard`, etc. (see
  `vercel.json` redirects+rewrites). Old `.html` links 308-redirect to the new ones. All internal links
  updated. Published user websites at `/:username` are unaffected (and `auth`/`app` are now reserved
  usernames so they can never collide).
- **Ads removed, W-loader added** — `api/site.js` no longer injects any ad snippet; every published
  page now shows the same W-logo loading animation Studio uses, self-contained, with a 4s safety timeout
  so it can never get stuck.
- **AI generator** — timeout raised 55s → 280s (not "too long", just needed more room), and generation
  now streams over SSE (`api/ai.js` + `assets/api.js:aiGenerateStream` + `assets/aigen.js`) so files
  appear live as the model writes them, with a real elapsed timer and a rough ETA. Falls back to the old
  one-shot request automatically if streaming isn't available in the deploy environment.
- **Environment variables** — new `listEnv`/`setEnv`/`deleteEnv` actions in `api/projects.js`
  (`projectEnv/{uid}/{pid}/{KEY}`). `config` vars are injected into the published site as
  `window.ENV.KEY`; `secret` vars are stored for the owner's reference only and are **never** sent to
  the browser (a static site has no server of its own to keep a real secret safe at request time — this
  is explained in Studio's new Docs panel).
- **Hybrid structure via API** — `POST /api/publish` now also accepts `{ files: [{path, content, enc}] }`
  for folders/multi-file sites, alongside the old `{ html, css, js }` single-file shape. Studio's own
  "Upload files" button also now auto-extracts a single dropped `.zip`, same as project creation does.
- **Docs panel** — new "Docs" button in Studio's top bar; copies a short Markdown brief (file/folder
  conventions, `window.ENV` usage, zip behaviour) meant to be pasted into any AI assistant.
- **Light theme** — new sun/moon toggle in the header (every page) and in Studio's top bar; persisted in
  `localStorage`, applied pre-paint by `assets/boot.js` (no flash). Studio's file tree/tabs/panels/drawers
  follow the toggle; the CodeMirror code-editing surface itself stays on its dark syntax theme on purpose
  (like most code editors) rather than needing a second full syntax-highlight theme.
- **Mobile pass** — bigger touch targets, full-width drawers, non-cramped context menus and toolbar on
  narrow screens (`assets/studio.css`). The CodeMirror/tab-switch mobile layout already existed; this is
  a polish pass on top of it, not a rewrite.

Not done in this round (not requested in the final list): the short-URL redirect system.
