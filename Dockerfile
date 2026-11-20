# Multi-stage Dockerfile for VIT Private Cloud Storage

# 1. Build Client
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# 2. Build Server
FROM node:20-alpine AS server-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install
COPY server/ ./
RUN npm run build

# 3. Production Runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy server artifacts
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm install --omit=dev

COPY --from=server-builder /app/server/dist ./dist
COPY --from=server-builder /app/server/src/prisma ./src/prisma
COPY --from=client-builder /app/client/dist /app/client/dist

# Prepare storage directories
RUN mkdir -p /app/storage/vault /app/storage/quarantine /app/storage/chunks

EXPOSE 5000

CMD ["node", "dist/index.js"]
