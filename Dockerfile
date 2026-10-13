# syntax=docker/dockerfile:1

# Single image serving the whole site from one origin:
#   /          public SPA  (built from src/)
#   /admin     admin SPA   (built from admin/)
#   /api/*     JSON API    (compiled from api/src)
#
# Everything is built in one stage because the API reads its neighbours off the
# filesystem at runtime: config.ts resolves repoRoot from its own location and
# looks for ../dist, ../admin/dist and ./migrations. Splitting the builds across
# images would mean reproducing that layout by hand and keeping it in sync.

FROM node:20-alpine

WORKDIR /app

# --- dependencies -----------------------------------------------------------
# Copied before the sources so an unchanged lockfile reuses the cached layer.
# Three separate packages: the public SPA, the API, and the admin app.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY api/package.json api/package-lock.json ./api/
RUN npm ci --prefix api --no-audit --no-fund

COPY admin/package.json admin/package-lock.json ./admin/
RUN npm ci --prefix admin --no-audit --no-fund

# --- sources ----------------------------------------------------------------
COPY . .

# The site is served from the root of a Render hostname, not from the
# /iwvpl/ subfolder GitHub Pages uses.
ENV BASE_PATH=/

# --- builds -----------------------------------------------------------------
RUN npm run build
RUN npm run build --prefix admin
RUN npm run build --prefix api

# Drop the build-time dependency trees. The API is compiled to plain ESM and
# its runtime dependencies are small; shipping ~500MB of Vite and TypeScript to
# production is waste. Re-installing just the API's deps is cheap and reliable.
RUN rm -rf node_modules admin/node_modules api/node_modules \
 && npm ci --prefix api --omit=dev --no-audit --no-fund

# --- runtime ----------------------------------------------------------------
ENV NODE_ENV=production
ENV HOST=0.0.0.0

# Render injects PORT (10000 for a free web service). api/src/config.ts reads
# it, so nothing here should hardcode a port.

EXPOSE 8080

# The migrations directory is read at runtime by the migration runner and the
# seed, not baked into the image, so it must survive the cleanup above. It is
# already present via COPY . . — this line only asserts the layout that
# config.ts depends on.
RUN test -f dist/index.html \
 && test -f admin/dist/index.html \
 && test -f api/dist/server.js \
 && test -f api/migrations/001_init.sql

# Run unprivileged. The node image ships a `node` user for exactly this.
USER node

CMD ["node", "api/dist/server.js"]