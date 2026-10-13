# tmpnote

Encrypted, self-destructing notes in the browser. The UI is a static site you can host on **GitHub Pages**. Cloudflare Worker storage provides at-most-once retrieval.

## How it works

1. Your note is encrypted in the browser with **AES-256-GCM** (Web Crypto).
2. The decryption key stays in the URL `#fragment` and is never sent to a server.
3. Only ciphertext is stored (when an API is configured).
4. Clicking “Reveal and destroy” retrieves the ciphertext once; the API atomically deletes it.

Without an API, **URL mode** packs the ciphertext into the link itself. That runs fully on GitHub Pages, but the link can be opened more than once.

## Quick start (local)

```bash
npm run dev
```

Open [http://127.0.0.1:8787](http://127.0.0.1:8787). The local server serves the static app and an in-memory burn-after-read API (and injects `apiBase` automatically).

## Deploy frontend to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main` (or `master`); the workflow in `.github/workflows/pages.yml` publishes the site.
4. Site URL will be like `https://<user>.github.io/tmpnote/`.

Edit `config.js` after you have an API URL (below).

## Deploy burn-after-read API (Cloudflare Worker)

```bash
cd worker
npx wrangler login
# set ALLOWED_ORIGINS to your Pages URL, e.g.
#   https://youruser.github.io
npx wrangler deploy
```

Then set in `config.js`:

```js
apiBase: "https://tmpnote-api.<your-subdomain>.workers.dev",
```

Commit and push so Pages picks up the config.

## Automatic Worker deployment

The `.github/workflows/worker.yml` workflow deploys Worker changes on pushes to
`main` or `master`, and supports manual runs from GitHub Actions.

One-time setup:

1. Create a Cloudflare API token at https://dash.cloudflare.com/profile/api-tokens
   using the **Edit Cloudflare Workers** template, scoped to your account.
2. Copy your Account ID from your account's **Workers & Pages** overview.
3. At https://github.com/schumannd/tmpnote/settings/secrets/actions, create repository
   secrets named `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. Push the workflow, or manually run **Deploy Cloudflare Worker** from Actions.

The workflow verifies API health and CORS after deployment. The existing Pages
workflow continues to publish frontend changes. Never put the API token in files
or chat. If this execution environment cannot push, push from your Mac terminal;
deployment then runs on GitHub without a local Wrangler login.

## Security notes

- The host never sees plaintext when encryption works as designed.
- Anyone with the full link (including the fragment) can read the note — share over a trusted channel.
- This is a personal/small-team tool, not a compliance product. Add rate limits before public exposure.

## Project layout

| Path | Role |
|---|---|
| `index.html`, `css/`, `js/` | Static app (Pages) |
| `config.js` | `apiBase`, limits, defaults |
| `worker/` | Cloudflare Worker + Durable Objects |
| `server/local-api.mjs` | Local static + API for development |
| `IMPLEMENTATION_PLAN.md` | Design and roadmap |

## License

MIT
