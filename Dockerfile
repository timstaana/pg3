# Multi-stage build for smaller image size
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files explicitly
COPY package.json package-lock.json ./

# Install dependencies (production only)
RUN npm ci --omit=dev

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY server.js ./
COPY package.json ./

# Copy game files (adjust if needed)
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error('Health check failed')})"

# Run server
CMD ["node", "server.js"]
