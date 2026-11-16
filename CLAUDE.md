# Portfolio Tracker — project notes

## Hosting & deploy

- **Hosted on Render.** Both the frontend (Vite build served by `npm start` → `serve -s dist`)
  and the FastAPI backend (`backend/`, free tier — local disk is wiped on every redeploy).
- **Deploy = push to `main` on the `ujj` remote** (`github.com/ujjxwal87/portfolio-tracker`).
  `main` tracks `ujj/main`; Render builds from that repo.
- Work directly on `main` — no feature branches for this project.
- Before pushing, run `npx vite build` to make sure the frontend builds.
- The `origin` / `new-origin` remotes (DfZErOs repo) are not the deploy target.
