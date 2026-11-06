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
