# syntax=docker/dockerfile:1.7
# Image de production : Next.js « standalone » (web) + image outils (worker, migrations, seeds, import).
ARG NODE_VERSION=24.22.1

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
# prisma generate (postinstall) lit prisma.config.ts : une URL factice suffit, aucune connexion n'est ouverte.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Variables factices pour la compilation uniquement ; les vraies valeurs sont fournies à l'exécution.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    BETTER_AUTH_SECRET="build-only-secret-not-used-at-runtime-000000" \
    pnpm build

# Outils : worker (pnpm worker), migrations (pnpm db:migrate), seed, import Rails.
FROM build AS tools
ENV NODE_ENV=production
RUN chown -R node:node /app
USER node
CMD ["pnpm", "worker"]

# Web : serveur Node minimal, utilisateur non root.
FROM node:${NODE_VERSION}-bookworm-slim AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
