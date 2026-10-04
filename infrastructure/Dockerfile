FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/workflow-worker/package.json apps/workflow-worker/package.json
COPY apps/integration-worker/package.json apps/integration-worker/package.json
COPY apps/mock/package.json apps/mock/package.json
COPY apps/customer-web/package.json apps/customer-web/package.json
COPY apps/partner-web/package.json apps/partner-web/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY apps/developer-web/package.json apps/developer-web/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/runtime/package.json packages/runtime/package.json
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts
FROM dependencies AS runtime-build
COPY scripts/build-runtime.mjs ./scripts/build-runtime.mjs
RUN node scripts/build-runtime.mjs
FROM scratch AS runtime
COPY --from=runtime-build /runtime /
ENV PATH=/usr/local/bin NODE_ENV=production
USER 65532:65532
FROM dependencies AS sources
COPY apps ./apps
COPY packages ./packages
FROM sources AS backend-build
COPY tsconfig.backend.json ./
COPY tests ./tests
RUN npm run build:backend && npm prune --omit=dev --ignore-scripts
FROM runtime AS backend
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=backend-build --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=backend-build --chown=65532:65532 /app/dist ./dist
COPY --from=backend-build /app/package.json ./package.json
COPY infrastructure/migrations ./infrastructure/migrations
EXPOSE 3000
HEALTHCHECK --interval=15s --start-period=45s --timeout=5s CMD ["node","-e","fetch('http://127.0.0.1:3000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node","dist/apps/api/src/main.js"]
FROM sources AS web-build
ARG WEB_APP=customer-web
ENV NODE_OPTIONS=--max-old-space-size=512
RUN mkdir -p apps/${WEB_APP}/public && npm run build --workspace=@insurance/${WEB_APP}
FROM runtime AS web
ARG WEB_APP=customer-web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 WEB_APP=${WEB_APP}
COPY --from=web-build --chown=65532:65532 /app/apps/${WEB_APP}/.next/standalone ./
COPY --from=web-build --chown=65532:65532 /app/apps/${WEB_APP}/.next/static ./apps/${WEB_APP}/.next/static
COPY --from=web-build --chown=65532:65532 /app/apps/${WEB_APP}/public ./apps/${WEB_APP}/public
COPY infrastructure/start-web.mjs ./infrastructure/start-web.mjs
EXPOSE 3000
HEALTHCHECK --interval=15s --start-period=30s --timeout=5s CMD ["node","-e","fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node","infrastructure/start-web.mjs"]
