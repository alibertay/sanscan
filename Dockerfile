# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    SANSCAN_DATA_DIR=/app/data

RUN addgroup -S sanscan && adduser -S sanscan -G sanscan \
    && mkdir -p /app/data && chown -R sanscan:sanscan /app

COPY --from=builder --chown=sanscan:sanscan /app/.next/standalone ./
COPY --from=builder --chown=sanscan:sanscan /app/.next/static ./.next/static
COPY --from=builder --chown=sanscan:sanscan /app/public ./public

USER sanscan
EXPOSE 3000

CMD ["node", "server.js"]
