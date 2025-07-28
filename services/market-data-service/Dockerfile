# Multi-stage build for Market Data Service
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libc6-compat \
    dumb-init \
    curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
FROM base AS deps
RUN npm ci --only=production && npm cache clean --force

# Build stage
FROM base AS build
COPY . .
RUN npm ci
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init curl

# Create app user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S marketdata -u 1001

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=build --chown=marketdata:nodejs /app/dist ./dist
COPY --from=deps --chown=marketdata:nodejs /app/node_modules ./node_modules
COPY --chown=marketdata:nodejs package*.json ./

# Create necessary directories
RUN mkdir -p /app/logs /app/cache /app/data && chown -R marketdata:nodejs /app

# Switch to non-root user
USER marketdata

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3002}/health || exit 1

# Environment variables
ENV NODE_ENV=production \
    PORT=3002 \
    METRICS_PORT=9092 \
    LOG_LEVEL=info

# Expose ports
EXPOSE 3002 9092

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]