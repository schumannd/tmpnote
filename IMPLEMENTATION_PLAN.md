# Implementation Plan — tmpnote

## Goal

A small web app for creating encrypted, self-destructing notes. The UI is a static site suitable for **GitHub Pages**. At-most-once retrieval needs a tiny storage API (Cloudflare Worker + Durable Objects); a zero-backend **URL mode** still works fully on Pages for demos and short notes.

## Constraints

| Constraint | Implication |
|---|---|
| GitHub Pages is static only | No Node/PHP on Pages; store ciphertext elsewhere or in the link |
| Secrets must not hit the server | Encrypt in the browser; put the key in the URL `#fragment` |
| “Self-destruct” means one read | Storage must delete (or expire) the ciphertext after the first successful fetch |
| Easy to host | Frontend → Pages; API → free Cloudflare Worker |

## Architecture

```
┌─────────────────────┐     ciphertext only      ┌──────────────────────┐
│  Browser (Pages)    │ ───────────────────────► │  Cloudflare Worker   │
│  Web Crypto AES-GCM │ ◄─────────────────────── │  + Durable Objects    │
│  key stays in #hash │     delete-on-read       └──────────────────────┘
└─────────────────────┘
```

### Security model

1. User writes plaintext in the browser.
2. Client generates a random AES-256-GCM key + IV.
3. Client encrypts plaintext → ciphertext.
4. Client `POST`s **only ciphertext + metadata** (TTL, createdAt) to the API.
5. API returns a short `id`.
6. Share URL: `https://user.github.io/tmpnote/#/n/<id>~<key>`.
7. On reveal: client loads ciphertext by `id`, decrypts with key from the fragment, with atomic deletion at retrieval (or returns 404 on a second fetch).

The server never sees plaintext or the key.

### Modes

| Mode | When | Behavior |
|---|---|---|
| **API** (default when configured) | `config.js` has `apiBase` | At-most-once retrieval + optional TTL |
| **URL** (fallback / demo) | No `apiBase`, or note fits in URL | Ciphertext lives in the hash; no server. Multiple opens still work; “destroy” is UI-only after view |

## Phases

### Phase 1 — Static app (this repo)

- [x] Create / view note UI
- [x] Client-side AES-GCM encrypt / decrypt
- [x] Shareable link with key in fragment
- [x] URL-embedded mode (no backend)
- [x] API client for burn-after-read
- [x] README + this plan
- [x] GitHub Actions workflow for Pages

### Phase 2 — Burn-after-read API

- [x] Cloudflare Worker: `POST /notes`, `POST /notes/:id` (delete after read)
- [x] SQLite-backed Durable Object binding for ciphertext
- [x] Optional TTL via Durable Object alarms
- [x] CORS for the Pages origin
- [x] Local in-memory server mirroring the Worker for `npm run dev`

### Phase 3 — Polish (optional follow-ups)

- [ ] Custom domain
- [ ] Rate limiting / abuse controls on the Worker
- [ ] Passphrase-strengthened keys (PBKDF2)
- [ ] “Burn after N views” and longer max TTL
- [ ] i18n / accessibility audit
- [ ] Automated e2e tests (Playwright)

## File map

```
tmpnote/
├── IMPLEMENTATION_PLAN.md
├── README.md
├── package.json
├── config.js                 # apiBase, site settings (edit after deploy)
├── index.html
├── css/styles.css
├── js/
│   ├── app.js                # routing + UI
│   ├── crypto.js             # Web Crypto helpers
│   ├── api.js                # HTTP client for Worker
│   └── url-storage.js        # URL-embedded ciphertext mode
├── worker/
│   ├── wrangler.toml
│   └── src/index.js          # Cloudflare Worker
├── server/
│   └── local-api.mjs         # Dev stand-in for the Worker
└── .github/workflows/
    └── pages.yml
```

## Deploy sequence

1. Push repo to GitHub; enable Pages (Actions).
2. Use the Durable Object binding and migration in `worker/wrangler.toml`.
3. `cd worker && npx wrangler deploy`; note the `*.workers.dev` URL.
4. Set `apiBase` in `config.js` to that URL; commit & push.
5. Restrict Worker CORS to the Pages origin.

## Out of scope (v1)

- User accounts
- Attachments / images
- Mobile native apps
- Guaranteed legal/compliance retention policies
