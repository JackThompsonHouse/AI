# What Claude Code Actually Built Here

A case-study single-pager documenting the real history of this repo:
an animated terminal replaying a real session, the actual `git log`,
a real diff from a real production bug, and the real deploy pipeline.
Static HTML/CSS/JS, containerized with nginx for deployment on
[Coolify](https://coolify.io).

## Structure

```
index.html      Single-page site (hero terminal, capabilities, history, fix.diff, deploy.sh)
css/styles.css  Styles
js/main.js      Mobile nav, scroll reveal, terminal typewriter, tab scroll-spy
assets/         SVG mark / favicon (plus leftover images from a previous
                 version of this site — no longer referenced)
psquote/        Internal PS quote builder tool (see below), served at /psquote/
sow-generator/  Internal SOW/proposal generator tool (see below), served at
                 /sow-generator/
api/            Backend for both internal tools - Node/Express + SQLite,
                 served internally (not exposed to the host), reached via
                 nginx's /psquote/api/ and /sow-generator/api/ proxies.
                 api/templates/ holds the SOW Word template + the script
                 that generated it from the original source document.
auth/htpasswd   Basic-auth credentials protecting /psquote/, /sow-generator/,
                 and their /api/ routes (not in web root)
Dockerfile      nginx:alpine image serving the static files (the "web" service)
nginx.conf      nginx server config (gzip, cache headers, IPv4 + IPv6 listeners,
                 basic auth + API reverse proxies on /psquote/ and /sow-generator/)
docker-compose.yaml   Two services - web (nginx) and api (Node/SQLite) - plus
                 a named volume so saved quotes and generated SOWs survive redeploys
.env.example    Template for the .env file Docker Compose reads locally
                 (ANTHROPIC_API_KEY) - see "SOW Generator" below for the
                 Coolify equivalent
```

## PS Quote Builder (`/psquote/`)

A multi-line professional-services quote calculator for internal use, ported
from the FY27 PS Quote Excel workbook. Pick a service grade, coverage type
(standard/evening-Saturday/Sunday-holiday) and day count per line item; cost,
sell price and margin are computed automatically per line and totalled by
service grade.

- **Save** stores the quote server-side (via `api/`) and switches to a
  compact read-only summary view of the line items — useful once a quote is
  more or less final and you don't want to scroll a wall of edit cards.
  **Edit** switches back to the full editable view; saving again updates the
  same record rather than creating a duplicate.
- **My quotes** lists everything saved server-side (customer, updated time,
  total sell) so a quote started on one device can be picked up on another.
- The browser's `localStorage` still autosaves the in-progress draft on top
  of this, purely as a same-device safety net against an accidental tab
  close before you hit Save.
- **Export CSV** / **Print / Save PDF** work on whatever's currently loaded,
  same as before.

It's plain HTML/CSS/JS on the frontend — no build step, no framework,
consistent with the rest of this repo. The backend (`api/`) is a small
Express app; quotes are stored as JSON blobs in SQLite (`better-sqlite3`)
rather than a normalized schema, since the frontend already owns the shape
of a quote and there's no need to duplicate that server-side.

**Access control**: `/psquote/` and `/psquote/api/` are both protected by HTTP
basic auth (`auth_basic` in `nginx.conf`, credentials in `auth/htpasswd`)
because they deal with Roc Technologies' real day rates, cost, and margin
data. The `^~` prefix modifier on those nginx locations is deliberate — it
makes sure `quote.js`/`quote.css` (which contain the rate table) and the API
both stay behind auth, rather than being served unauthenticated by the
static-asset caching rule further down the file. `/psquote/api/` is listed
before `/psquote/` so nginx's longest-prefix match routes API calls to the
backend instead of falling into the static file handler.

Current login: username `psquote`. The password was generated randomly at
build time — ask whoever set this up, or regenerate it:

```bash
NEWPASS=$(openssl rand -base64 18 | tr -d '=+/' | cut -c1-20)
echo "psquote:$(openssl passwd -apr1 "$NEWPASS")" > auth/htpasswd
echo "New password: $NEWPASS"
```

**Data persistence**: saved quotes live in a SQLite file at `/data/quotes.db`
inside the `api` container, backed by the `quotes-data` named volume in
`docker-compose.yaml`. If that volume isn't preserved across deploys (e.g. a
Coolify configuration that recreates volumes from scratch), saved quotes
will be lost on redeploy — worth confirming the volume persists after your
first deploy by saving a test quote, redeploying, and checking it's still
in **My quotes**.

**Source data**: the original `.xlsx` workbook this was ported from contains
full internal cost/margin detail across many roles and is intentionally
gitignored (`*.xlsx`) — never commit it. Only the rates needed by the tool
are embedded in `psquote/quote.js`.

## SOW Generator (`/sow-generator/`)

Turns a pasted meeting transcript or free-text requirements list into a
first-draft Statement of Work / sales proposal, using Roc's actual proposal
template (branding, headers/footers, Terms & Conditions all preserved
exactly), with a review step before anything is generated.

Three steps:

1. **Paste & Generate** — paste a transcript or requirements, click
   Generate. The `api` backend sends it to the Anthropic Messages API
   (model `claude-sonnet-5` by default, override with `ANTHROPIC_MODEL`)
   with the transcript as user content and a **tool-forced** call, so the
   response reliably matches the JSON schema in `api/sow-schema.js` rather
   than needing fragile prose parsing. The system prompt enforces UK
   English/punctuation, no em/en dashes standing in for commas, and — most
   importantly — `"TBC"` for anything not actually stated or reasonably
   inferable in the input, rather than inventing content.
2. **Review & edit** — the extracted JSON renders as an editable form,
   grouped by section in the template's own order, with fields the model
   couldn't fill flagged `(TBC)`. Correct or fill in anything before
   generating the actual document. Nothing is written to the `.docx` until
   this step is submitted.
3. **Generate document** — the reviewed JSON is merged into the real Word
   template server-side via `docxtemplater` (a `{tag}`-based templating
   library — Claude never generates the `.docx` freeform, so branding,
   formatting, and legal boilerplate can't drift). Produces a downloadable
   `.docx` and stores the transcript, extracted JSON, and final document so
   past SOWs can be revisited via **My SOWs**.

**How the template works**: `api/templates/sow-source.dotx` is the
untouched original Roc proposal template. `api/templates/build_template.py`
converts it into `api/templates/sow-template.docx` — the actual runtime
template — by rewriting specific paragraphs/table cells into
`{dottedPathTag}` placeholders and `{#loop}`/`{/loop}` /
`{#condition}`/`{^condition}` sections (docxtemplater's row-repeat and
table-level conditional techniques), operating on the parsed XML tree
rather than raw string replacement so it's robust to however Word split
text across runs internally. Boilerplate sections (Terms & Conditions,
Confidentiality Agreement, the standard PM task list, the generic
Assumptions examples) are deliberately left untouched — not part of the
JSON schema at all — so they can't drift from the approved wording; only
the milestone-vs-time-and-materials sentence choice in the T&Cs is
templated. If the source template ever needs to change, edit
`sow-source.dotx` in Word and re-run `python3 build_template.py` from
`api/templates/` to regenerate `sow-template.docx`.

Because `docxtemplater` doesn't resolve dotted tag text like `{a.b}`
against nested objects by default (it does a flat literal-key lookup), both
the build script's tags and `server.js`'s render call use a small custom
parser that walks the dotted path against whatever scope it's given - see
`dottedPathParser` in `api/server.js`.

**Access control**: same pattern as `/psquote/` — `auth_basic` in
`nginx.conf`, same `auth/htpasswd` credentials, `^~` prefix modifiers so
`/sow-generator/api/` and the tool's JS/CSS assets stay behind auth too.

**Required environment variable**: `ANTHROPIC_API_KEY`. Locally, copy
`.env.example` to `.env` and fill it in — Docker Compose reads `.env`
automatically. **In Coolify**, set `ANTHROPIC_API_KEY` under this
application's **Environment Variables** tab (scoped to the `api` service if
Coolify's compose UI asks) rather than relying on a committed `.env` file —
`.env` is gitignored and won't exist in the deployed image. Without it, the
Generate button will fail with a clear "ANTHROPIC_API_KEY is not
configured" error rather than a confusing crash.

**Generated documents storage**: `.docx` files land in
`/data/sow-documents/` inside the `api` container (same `quotes-data`
volume as the quote builder, different subfolder), with metadata (client,
project, transcript, extracted JSON) in a `sow_documents` SQLite table in
the same database file. Same persistence caveat as the quote builder above
applies — confirm the volume survives a redeploy.

**Source template confidentiality**: `sow-source.dotx` (the original,
5MB, image-heavy template) and the generated `.docx` outputs both contain
Roc commercial content. Neither is served from the public web root — the
source lives only inside `api/`'s build context, and generated documents
are only reachable via the authenticated `/sow-generator/api/documents/*`
routes, never as static files.

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

This app now has two services (`web` + `api`) and a named volume, so it
**must** be deployed via the **Docker Compose** build pack pointing at
`docker-compose.yaml` — the plain Dockerfile build pack only builds `web` and
won't start the API backend at all, breaking Save/My quotes.

1. Push this repository to your git remote (already configured as `origin`).
2. In Coolify, create a new **Resource → Application** and point it at this
   repository/branch.
3. Choose the **Docker Compose** build pack, pointing at `docker-compose.yaml`
   at the repo root. If this resource was previously set up on the plain
   **Dockerfile** build pack, switch it to Docker Compose — otherwise the
   `api` service and `quotes-data` volume are silently ignored.
4. Set **`ANTHROPIC_API_KEY`** under this application's **Environment
   Variables** in Coolify (needed for the SOW Generator's extraction step -
   see "SOW Generator" above). Without it, `/sow-generator/` still loads
   fine, but clicking Generate returns a clear configuration error instead
   of calling the model.
5. Confirm Coolify is persisting the `quotes-data` volume across deploys
   (most Coolify setups do this automatically for named volumes declared in
   compose, but it's worth checking after the first deploy - see "Data
   persistence" above). This volume now holds both saved quotes and
   generated SOW documents.
6. Only `web`'s port 80 needs to be exposed externally — `api` is reached
   internally by `web` via the compose network (service name `api`, port
   `3001`) and shouldn't need a public port at all.
7. Attach your domain and deploy.

Every push to the tracked branch can trigger an automatic redeploy if you
enable Coolify's webhook/auto-deploy for this app.
