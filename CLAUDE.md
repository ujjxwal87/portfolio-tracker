# Portfolio Tracker — project notes

## Hosting & deploy (Render + Supabase)

| Piece | Where |
|---|---|
| Frontend (Vite static site) | https://portfolio-tracker-web-g1xf.onrender.com — build `npm install && npm run build`, publish `dist`, repo root |
| Backend (FastAPI web service) | https://portfolio-tracker-api-wzbw.onrender.com — Root Directory `backend`, env `PYTHON_VERSION=3.11.9` |
| Database | Supabase (Postgres, SSL required) |
| Repo Render builds from | **`github.com/DfZErOs/Portfolio-tracker`**, branch `main` |

- **Deploy = push `main` to the DfZErOs repo.** Render auto-builds from it.
  The `ujjxwal87/portfolio-tracker` repo (remote `ujj`) is NOT watched by Render — pushing there
  deploys nothing (this is what went wrong on 16 Nov 2026).
- Pushing to DfZErOs needs that GitHub account's credentials (fine-grained token with the repo
  selected, Contents: Read and write). The Render account is most likely "Sign in with GitHub"
  as **DfZErOs**.
- Work directly on `main`. Run `npx vite build` before pushing.
- Env vars live in Render's Environment tab, never in a committed `.env`.
  `FRONTEND_ORIGIN` on the backend must equal the frontend URL exactly (CORS).
- Free tier sleeps when idle; first request can take ~50s. Backend disk is wiped on redeploy.
- Check a deploy actually landed: fetch the live page, find its `/assets/index-*.js`, and grep
  it for a string from the new code. Hard refresh (Cmd+Shift+R) in the browser.
