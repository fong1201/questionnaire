# Both web apps in one nginx image (used by docker compose and Kubernetes; AWS uses S3 + CloudFront).
# Build from the repository root:
#   docker build -f frontend/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY frontend/questionnaire-web/package.json frontend/questionnaire-web/
COPY frontend/dashboard-web/package.json frontend/dashboard-web/
RUN npm ci -w @questionnaire/shared -w @questionnaire/questionnaire-web -w @questionnaire/dashboard-web
COPY packages/shared packages/shared
COPY frontend/questionnaire-web frontend/questionnaire-web
COPY frontend/dashboard-web frontend/dashboard-web
ARG VITE_DASHBOARD_URL
ENV VITE_DASHBOARD_URL=${VITE_DASHBOARD_URL}
RUN npm run build -w @questionnaire/shared \
 && npm run build -w @questionnaire/questionnaire-web \
 && npm run build -w @questionnaire/dashboard-web

FROM nginx:1.29-alpine
# Upstreams are resolved from these variables when the container starts (nginx envsubst templates).
ENV QUESTIONNAIRE_API_UPSTREAM=questionnaire-api:3000 \
    DASHBOARD_API_UPSTREAM=dashboard-api:3000
COPY frontend/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/frontend/questionnaire-web/dist /usr/share/nginx/questionnaire
COPY --from=build /repo/frontend/dashboard-web/dist /usr/share/nginx/dashboard
EXPOSE 8080 8081
