# One image: the server serves the built client from the same origin, so there
# is no CORS and the WebSocket goes straight through.
#
# Everything built here is plain JavaScript, so it is built once on the
# builder's own architecture ($BUILDPLATFORM) and only the last layer belongs to
# the target platform. That way an image for a Raspberry Pi doesn't spend half
# an hour under emulation. If a dependency with native binaries ever shows up,
# drop the --platform from these two stages.

FROM --platform=$BUILDPLATFORM node:20-alpine AS build
WORKDIR /app
# Manifests first: if they don't change, the dependency layer is reused.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci
COPY . .
RUN npm run build

# Only what is needed to run: the engine and the server are inside the bundle,
# so all that is left down here is socket.io.
FROM --platform=$BUILDPLATFORM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci --omit=dev --workspace @trio/server

FROM node:20-alpine AS runtime
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/client/dist ./packages/client/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1
CMD ["node", "packages/server/dist/index.js"]
