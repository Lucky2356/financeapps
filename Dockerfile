# syntax=docker/dockerfile:1
FROM node:24-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Prisma on Alpine needs OpenSSL present to load its query/schema engines,
# otherwise: "Could not parse schema engine response" / libssl detection warnings.
RUN apk add --no-cache openssl libc6-compat

# Dependencies
FROM base AS deps
COPY package*.json ./
RUN npm ci

# Build
FROM base AS builder
ENV NEXT_OUTPUT=standalone
ENV NEXT_PUBLIC_APP_PLATFORM=web
ENV NEXT_PUBLIC_APP_ENV=production
ENV NEXT_PUBLIC_API_MODE=cloud
ENV NEXT_PUBLIC_API_BASE_URL=/api
ENV NEXT_PUBLIC_DESKTOP_DATA_MODE=cloud
ENV NEXT_PUBLIC_MARKET_DATA=moex
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Production runner
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Prisma query engine isn't always traced into the standalone bundle — copy the
# generated client + engine explicitly so runtime DB access works.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
