FROM node:20-alpine AS base
WORKDIR /app
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3003/health || exit 1
CMD ["node", "src/index.js"]
