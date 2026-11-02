FROM oven/bun:1.3.3
WORKDIR /app

COPY package.json bun.lock ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json biome.json ./
RUN bun install --frozen-lockfile
RUN bun run build:web

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["bun", "apps/server/src/index.ts"]
