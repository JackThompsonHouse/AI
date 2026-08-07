# Copium Squad

A completely unsanctioned Apex Legends performance review for Mullet
(professional grey-loot enthusiast) and Ben (solo push connoisseur).
Static HTML/CSS/JS site, containerized with nginx for deployment on
[Coolify](https://coolify.io).

## Structure

```
index.html      Single-page site (hero, patch notes, case files, replay, stats, program, pledge)
css/styles.css  Styles
js/main.js      Mobile nav, scroll reveal, pledge form
assets/         SVG mark / favicon
Dockerfile      nginx:alpine image serving the static files
nginx.conf      nginx server config (gzip, cache headers, IPv4 + IPv6 listeners)
docker-compose.yml
```

## Local preview

No build step required. Either open `index.html` directly in a browser, or
serve it locally:

```bash
python3 -m http.server 8080
# or
npx serve .
```

Then visit `http://localhost:8080`.

To test the production container:

```bash
docker compose up --build
# visit http://localhost:3000
```

## Deploying on Coolify

1. Push this repository to your git remote (already configured as `origin`).
2. In Coolify, create a new **Resource → Application** and point it at this
   repository/branch.
3. Coolify will detect the `Dockerfile` at the repo root — choose the
   **Dockerfile** build pack (or **Docker Compose**, pointing at
   `docker-compose.yml`).
4. Set **Ports Exposes** to `80` (container listens on 80 via nginx) —
   this must be exactly `80`, not left as Coolify's default `3000`.
5. Attach your domain and deploy.

Every push to the tracked branch can trigger an automatic redeploy if you
enable Coolify's webhook/auto-deploy for this app.
