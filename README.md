# Thompsonhouse

Marketing website for **Thompsonhouse**, a managed IT services provider.
Static HTML/CSS/JS site, containerized with nginx for deployment on
[Coolify](https://coolify.io).

## Structure

```
index.html      Single-page site (hero, services, approach, why us, contact)
css/styles.css  Styles
js/main.js      Mobile nav, scroll reveal, form UX
assets/         SVG mark / favicon
Dockerfile      nginx:alpine image serving the static files
nginx.conf      nginx server config (gzip, cache headers, SPA fallback)
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
4. Set the exposed port to `80` (container listens on 80 via nginx).
5. Attach your domain and deploy.

Every push to the tracked branch can trigger an automatic redeploy if you
enable Coolify's webhook/auto-deploy for this app.

## Customize before launch

- Replace the placeholder phone/email in `index.html` (`#contact` section)
  with real contact details.
- Swap the two sample client quotes for real testimonials.
- Update the industries list in the "served" section if it doesn't match
  your client base.
- Replace `assets/mark.svg` if you have a different logo mark.
