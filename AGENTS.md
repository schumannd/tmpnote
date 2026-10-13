# Deployment

- Frontend: https://schumannd.github.io/tmpnote/ via `.github/workflows/pages.yml`.
- API: https://tmpnote-api.tmpnote.workers.dev via `.github/workflows/worker.yml`.
- Worker changes deploy automatically on pushes to main/master once GitHub Actions
  secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are configured.
- User requests to deploy authorize the normal commit/push/deploy sequence.
  Stage only task-related files; do not include unrelated `redditscroll.html`.
- On 2026-10-13, this execution environment could not resolve public DNS or
  resolve UID 501 through macOS user lookup, even with approved escalation.
  Wrangler failed with DNS errors; SSH failed with `No user exists for uid 501`.
  Try approved execution once when relevant. If these exact failures recur,
  report the environment limitation and avoid repeated retries or changes to
  credentials, SSH configuration, system DNS, or sandbox restrictions.
- Use GitHub-hosted deployment when possible. It avoids requiring local Wrangler
  login and local Cloudflare API access. GitHub push still requires working
  network and Git authentication in the execution environment.
- Do not claim deployment succeeded without checking the deployment result.
