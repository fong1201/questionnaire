# Build from the repository root:
#   docker build -f backend/questionnaire-api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/questionnaire-api/package.json backend/questionnaire-api/
RUN npm ci -w @questionnaire/shared -w @questionnaire/questionnaire-api
COPY packages/shared packages/shared
COPY backend/questionnaire-api backend/questionnaire-api
RUN npm run build -w @questionnaire/shared \
 && npm run build -w @questionnaire/questionnaire-api \
 && npm prune --omit=dev -w @questionnaire/shared -w @questionnaire/questionnaire-api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/package.json packages/shared/
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/backend/questionnaire-api/package.json backend/questionnaire-api/
COPY --from=build /repo/backend/questionnaire-api/dist backend/questionnaire-api/dist
WORKDIR /repo/backend/questionnaire-api
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/questionnaire/health || exit 1
CMD ["node", "dist/main.js"]
