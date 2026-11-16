# Portfolio Tracker — project notes

## Hosting & deploy (Render + Supabase)

| Piece | Where |
|---|---|
| Frontend (Vite static site) | https://portfolio-tracker-web-g1xf.onrender.com — build `npm install && npm run build`, publish `dist`, repo root |
| Backend (FastAPI web service) | https://portfolio-tracker-api-wzbw.onrender.com — Root Directory `backend`, env `PYTHON_VERSION=3.11.9` |
| Database | Supabase (Postgres, SSL required) |
| Repo Render builds from | **`github.com/ujjxwal87/portfolio-tracker`** (git remote `origin`), branch `main`, auto-deploy on commit |

- **Deploy = `git push origin main`.** Render auto-builds from it.
- The old `DfZErOs/Portfolio-tracker` repo and GitHub account are dead (switched 16 Nov 2026).
  Never push there or point Render at it. Render's GitHub app access on ujjxwal87 is managed at
  https://github.com/settings/installations → Render → Configure.
- Work directly on `main`. Run `npx vite build` before pushing.
- Env vars live in Render's Environment tab, never in a committed `.env`.
  `FRONTEND_ORIGIN` on the backend must equal the frontend URL exactly (CORS).
- Free tier sleeps when idle; first request can take ~50s. Backend disk is wiped on redeploy.
- Check a deploy actually landed: fetch the live page, find its `/assets/index-*.js`, and grep
  it for a string from the new code. Hard refresh (Cmd+Shift+R) in the browser.
