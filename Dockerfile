# syntax=docker/dockerfile:1
# Production image: builds the API and React frontend, runs migrations on start.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Prisma config needs a URL at build time even though no database is contacted.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json /app/prisma.config.ts ./
# The Prisma CLI (a dev dependency) is kept so `migrate deploy` can run at start-up.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
