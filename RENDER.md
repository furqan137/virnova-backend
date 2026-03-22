# Deploy Virnova backend on Render

You must complete these steps in the [Render dashboard](https://dashboard.render.com) (this cannot be done automatically from your editor).

## Option A — Blueprint (whole repo with `backend` folder)

1. Push the **full Virnova monorepo** to GitHub (root contains `backend/` and `render.yaml`).
2. Render → **New +** → **Blueprint**.
3. Connect the repo → Render reads `render.yaml` and creates the web service with `rootDir: backend`.
4. In the service **Environment** tab, add the **secret variables** below (Blueprint only sets `NODE_VERSION`; add the rest manually).

## Option B — Web Service (recommended if repo is only `backend`)

1. Push your backend to a GitHub repo (folder contents = `backend` at repo root), **or** use the monorepo with **Root Directory** = `backend`.
2. Render → **New +** → **Web Service**.
3. Connect the repository.
4. Configure:

| Setting | Value |
|--------|--------|
| **Name** | e.g. `virnova-api` |
| **Region** | Choose closest to you |
| **Branch** | `main` (or your default) |
| **Root Directory** | `backend` *(if monorepo)* — leave empty if repo is backend-only |
| **Runtime** | **Node** |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance type** | Free *(cold starts after idle)* |

5. **Advanced** → **Health Check Path** → `/health`

6. **Environment** → **Add Environment Variable**:

| Key | Value | Required |
|-----|--------|----------|
| `MONGODB_URI` | MongoDB Atlas connection string (or other Mongo URL) | **Yes** |
| `JWT_SECRET` | Long random string (e.g. run `openssl rand -hex 32`) | **Yes** |
| `CORS_ORIGIN` | Your Vercel URL(s), comma-separated, no trailing slash | **Yes** for browser app |
| `WAVESPEED_API_KEY` | Your Wavespeed key | If you use AI features |
| `WAVESPEED_MODEL` | e.g. `bytedance-seed/seed-1.6-flash` | Optional |
| `NODE_VERSION` | `20` | Recommended |

**Do not set** `PORT` on Render (Render injects it).  
**Do not set** `MONGO_OPTIONAL` in production unless you know you need it.

### CORS example

If your frontend is `https://virnova.vercel.app`:

```text
CORS_ORIGIN=https://virnova.vercel.app
```

Multiple origins (production + Vercel preview):

```text
CORS_ORIGIN=https://virnova.vercel.app,https://virnova-git-main-yourname.vercel.app
```

### MongoDB Atlas (for Render)

1. Atlas → **Network Access** → allow **`0.0.0.0/0`** (or Render’s egress IPs if you prefer lockdown).
2. **Database Access** → user with read/write on your DB.
3. Copy **connection string** → set as `MONGODB_URI` (replace `<password>`).

## After deploy

1. Open `https://<your-service>.onrender.com/health` → should return `{"ok":true,"service":"virnova-backend"}`.
2. Put the same base URL (no trailing slash) in Vercel as `VITE_API_BASE_URL`.

## Troubleshooting

| Issue | What to check |
|--------|----------------|
| Build fails | Root Directory = `backend`, Node 18+ |
| Crashes on start | `MONGODB_URI` wrong; Atlas network access |
| CORS errors in browser | `CORS_ORIGIN` matches exact Vercel URL (https, no `/` at end) |
| Slow first request | Free tier sleeps; normal |
