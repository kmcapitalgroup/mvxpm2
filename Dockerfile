# Multi-stage build for production optimization
FROM node:18-alpine AS base

# Set working directory
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Development stage
FROM base AS development

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY . .

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3000

# Start development server
CMD ["dumb-init", "npm", "run", "dev"]

# Production dependencies stage
FROM base AS dependencies

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM base AS production

# Set environment to production
ENV NODE_ENV=production

# Copy production dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p logs cache temp

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Start production server
CMD ["dumb-init", "node", "server.js"]

# Build stage for testing
FROM base AS test

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Run tests
CMD ["npm", "test"]

# Default to production stage
FROM production AS final

# Labels for metadata
LABEL maintainer="MultiversX Timestamp Service Team"
LABEL version="1.0.0"
LABEL description="Blockchain timestamping service for MultiversX"
LABEL org.opencontainers.image.title="MultiversX Timestamp Service"
LABEL org.opencontainers.image.description="A robust blockchain timestamping service built on MultiversX"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.vendor="KMCPG"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.source="https://github.com/example/multiversx-timestamp"
LABEL org.opencontainers.image.documentation="https://github.com/example/multiversx-timestamp/blob/main/README.md"