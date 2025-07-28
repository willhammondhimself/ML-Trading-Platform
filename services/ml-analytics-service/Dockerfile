# Multi-stage build for ML Analytics WebSocket Service
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libc6-compat \
    dumb-init

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
RUN apk add --no-cache dumb-init

# Create app user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S app -u 1001

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=build --chown=app:nodejs /app/dist ./dist
COPY --from=deps --chown=app:nodejs /app/node_modules ./node_modules
COPY --chown=app:nodejs package*.json ./

# Create necessary directories
RUN mkdir -p /app/logs /app/temp && chown -R app:nodejs /app

# Switch to non-root user
USER app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node dist/scripts/health-check.js || exit 1

# Environment variables
ENV NODE_ENV=production \
    PORT=8001 \
    WEBSOCKET_PORT=8001 \
    LOG_LEVEL=info \
    METRICS_PORT=9090

# Expose ports
EXPOSE 8001 9090

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]