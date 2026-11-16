# Portfolio Tracker — project notes

## Hosting & deploy

- **Hosted on Render.** Both the frontend (Vite build served by `npm start` → `serve -s dist`)
  and the FastAPI backend (`backend/`, free tier — local disk is wiped on every redeploy).
- **Deploy = push to `main` on the `ujj` remote** (`github.com/ujjxwal87/portfolio-tracker`).
  `main` tracks `ujj/main`.
- Live frontend: https://portfolio-tracker-web-g1xf.onrender.com
- Render's own auto-deploy was unreliable (pushes on 16 Nov 2026 never built), so deploys are
  triggered by the GitHub Action `.github/workflows/render-deploy.yml`. It POSTs Render deploy
  hooks stored as repo secrets `RENDER_DEPLOY_HOOK_WEB` (frontend) and `RENDER_DEPLOY_HOOK_API`
  (backend, optional). Hook URLs come from Render → service → Settings → Deploy Hook.
- To check a deploy actually landed: `gh run list -w render-deploy.yml`, then fetch the live
  page's `/assets/index-*.js` and grep for a string from the new code.
- Work directly on `main` — no feature branches for this project.
- Before pushing, run `npx vite build` to make sure the frontend builds.
- The `origin` / `new-origin` remotes (DfZErOs repo) are not the deploy target.
