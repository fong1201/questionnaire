# Build from the repository root:
#   docker build -f backend/vote-worker/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY backend/vote-worker/package.json backend/vote-worker/
RUN npm ci -w @questionnaire/shared -w @questionnaire/database -w @questionnaire/vote-worker
COPY packages/shared packages/shared
COPY packages/database packages/database
COPY backend/vote-worker backend/vote-worker
RUN npm run build -w @questionnaire/shared \
 && npm run build -w @questionnaire/database \
 && npm run build -w @questionnaire/vote-worker \
 && npm prune --omit=dev -w @questionnaire/shared -w @questionnaire/database -w @questionnaire/vote-worker

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/package.json packages/shared/
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/database/package.json packages/database/
COPY --from=build /repo/packages/database/dist packages/database/dist
COPY --from=build /repo/backend/vote-worker/package.json backend/vote-worker/
COPY --from=build /repo/backend/vote-worker/dist backend/vote-worker/dist
WORKDIR /repo/backend/vote-worker
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
# This image also runs migrations: node /repo/packages/database/dist/migrate.js
CMD ["node", "dist/main.js"]
