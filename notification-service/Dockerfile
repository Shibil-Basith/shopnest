FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3006
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3006/health || exit 1
CMD ["node", "src/index.js"]
