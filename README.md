# VITIA NIGHT DROP (VND)

Late-night cash-on-delivery PWA for Viti, Kosovo. Customer site in Albanian, admin/driver in English.

Needs **Node.js 22.13 or newer**.

## Run on this laptop

```
npm install
npm run build
```

Development (hot reload):

```
$env:ENABLE_SIMULATION="true"
npm run dev
```

Production-style locally:

```
$env:NODE_ENV="production"
$env:ADMIN_PHONE="044000000"
$env:ADMIN_PASSWORD="at-least-10-chars"
npm start
```

Open http://localhost:8787 — customer shop. Admin: `/admin` with the admin phone/password.

## Server and database

There is **no MySQL / MariaDB / Postgres** to create in hPanel. VND is one Node process plus one SQLite file on disk.

**Server** — `npm start` runs Express (`server/index.js`). It serves `/api` and the built PWA from `dist/`. Hostinger usually injects `PORT`; leave `PORT` out of `.env` if they set it, or match the port they show. `HOST=0.0.0.0`. Node **22.13+** is required (`node:sqlite`). One process only — do not scale to multiple Node instances (SQLite is a single file).

**Database** — `data/vnd.db` (plus `data/vnd.db-wal` and `data/vnd.db-shm` while the app is running). Created automatically on first start. It holds users, sessions, products, orders, announcements, settings. Product photos live in `data/uploads/`. The Node user must be able to **write** `data/`.

On first start with an empty `data/`:

- Admin account is created from `ADMIN_PHONE` / `ADMIN_PASSWORD`
- The catalog is seeded if there are no products

Do **not** copy this laptop’s `data/vnd.db` to production if it has test orders and test customers. Start empty on the host, then add photos in Admin → Products. To keep the Viva catalog and photos, copy **both** `data/vnd.db` and `data/uploads/` (stop the app first so the WAL file is flushed).

**Backups** — copy the whole `data/` folder (database + photos). After a restart or deploy, that folder must still be there; if Hostinger wipes the app directory, accounts and orders disappear.

PHP-only shared hosting cannot run this. Use Hostinger **Node.js** (or a VPS).

## Launch on Hostinger (you already paid — point the domain)

This app is a **Node.js** process, not a static HTML site. The host must run Node (Hostinger Business/Cloud **Node.js** app, or a VPS). Shared PHP-only hosting will not work.

### 1. Point the domain

In hPanel:

1. **Domains** → your domain (or add it if it is new).
2. If the domain currently opens WordPress or another site, switch it to this Node app:
   - **Websites** → **Add website** / **Node.js** (or **Advanced** → **Node.js**).
   - Set the application **root** to the folder where you upload this project.
   - **Start command:** `npm start` (or `node server/index.js`).
   - **Node version:** 22.x if listed, otherwise the newest they offer (must be ≥ 22.13).
3. Attach the domain: **Domains** → **Connect** / **Change domain** → choose this Node app.
4. DNS (if the domain is at Hostinger, this is usually automatic):
   - **A record** `@` → Hostinger web IP
   - **CNAME** `www` → your domain  
   If the domain is at another registrar, change those two records there to Hostinger’s IP.
5. **SSL** → issue a free Let’s Encrypt certificate. GPS and “Add to Home Screen” need **https://**.

`ALLOWED_ORIGINS` in `.env` must be the exact public URL, for example `https://vnd.com` and if you use www, add `https://www.vnd.com` too (comma-separated).

### 2. Upload the project

Upload the whole folder **except** `node_modules`. On the server:

```
npm ci
npm run build
```

Create `.env` from `.env.example`. Set:

- `NODE_ENV=production`
- `ADMIN_PHONE` / `ADMIN_PASSWORD` (10+ characters) — **your** live login, not the laptop `vnd-dev-admin`
- `ALLOWED_ORIGINS=https://YOUR-DOMAIN`
- `COOKIE_SECURE=true`
- `TRUST_PROXY=true`

Do **not** set `ENABLE_SIMULATION` on the live server. It is ignored in production anyway.

Create `data/` and `data/uploads/` and make sure the Node process can write there. Back up `data/` regularly (that is the database and product photos).

Start / restart the Node app in hPanel. Open `https://YOUR-DOMAIN` then `https://YOUR-DOMAIN/admin`.

### Updates (GitHub → Hostinger)

Repo: https://github.com/erion062/vitia-night-drop  
Live shop data is **not** in GitHub. Hostinger Git deploys replace the app build folder, so the database is kept in `persistent/` next to `hbuilds/` (orders, customers, photos stay).

In hPanel, open the **existing** vndviti.com Node app (do not Add Website, do not delete the live site):

1. Connect GitHub → `erion062/vitia-night-drop` → branch `main`.
2. Deploy settings:
   - Framework: **Express** (not Vite / React)
   - Node.js: **22**
   - Build command: `build`
   - Entry file: `server/index.js`
   - Output directory: leave empty
3. Environment variables (import the live `.env` once): `NODE_ENV=production`, `ADMIN_PHONE`, `ADMIN_PASSWORD`, `ANDI_PHONE`, `ANDI_PASSWORD`, `ALLOWED_ORIGINS=https://vndviti.com,https://www.vndviti.com`, `COOKIE_SECURE=true`, `TRUST_PROXY=true`. Do not set `ENABLE_SIMULATION`.
4. Deploy. After that, every `git push` to `main` rebuilds and restarts the app. Env vars persist.

```
git add -A
git commit -m "your change"
git push
```

`npm run zip` is still there as a manual fallback. `npm run zip:launch` is only for a first install or a deliberate full reset.

### 3. After it is live

- Log in as admin, set **delivery area**, hours, fees, and product prices.
- Test GPS on the phone over **HTTPS**.
- Customer PWA: Add to Home Screen on the phone.
- If login fails, check `ALLOWED_ORIGINS` matches the URL in the address bar (www vs non-www).

## What this app does not include

Loyalty, coupons, multi-driver, SMS, native App Store apps.
