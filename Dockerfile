# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Install git (required for repo scanning)
RUN apk add --no-cache git python3 make g++

# Copy dependency tree from build stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source
COPY src/ ./src/
COPY public/ ./public/
COPY package.json ./

# Vendor assets (xterm.js, etc.)
RUN node src/setup-vendor.js

# Persistent data directory — mount a volume here for config + sessions
RUN mkdir -p /app/data
VOLUME ["/app/data"]

# Expose the dashboard port
EXPOSE 4177

# Team mode by default in Docker (bind to all interfaces)
ENV REPOTRACKER_TEAM=1
ENV PORT=4177

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:4177/ > /dev/null || exit 1

CMD ["node", "src/server.js"]
