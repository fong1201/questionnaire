# Build from the repository root:
#   docker build -f backend/dashboard-api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY backend/dashboard-api/package.json backend/dashboard-api/
RUN npm ci -w @questionnaire/shared -w @questionnaire/database -w @questionnaire/dashboard-api
COPY packages/shared packages/shared
COPY packages/database packages/database
COPY backend/dashboard-api backend/dashboard-api
RUN npm run build -w @questionnaire/shared \
 && npm run build -w @questionnaire/database \
 && npm run build -w @questionnaire/dashboard-api \
 && npm prune --omit=dev -w @questionnaire/shared -w @questionnaire/database -w @questionnaire/dashboard-api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/package.json packages/shared/
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/database/package.json packages/database/
COPY --from=build /repo/packages/database/dist packages/database/dist
COPY --from=build /repo/backend/dashboard-api/package.json backend/dashboard-api/
COPY --from=build /repo/backend/dashboard-api/dist backend/dashboard-api/dist
WORKDIR /repo/backend/dashboard-api
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/dashboard/health || exit 1
CMD ["node", "dist/main.js"]
