# QT Passport
#
# The database is a SQLite file, so this image MUST be run with a persistent
# volume mounted at /data. On a host with an ephemeral filesystem every deploy
# would silently erase every child's records.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A build-time placeholder: the real secret is supplied at runtime. Without
# something here the build fails on any page that touches sessions.
ENV QTP_SESSION_SECRET=build-time-placeholder-not-used-at-runtime
ENV NEXT_TELEMETRY_DISABLED=1
# Switches on the self-contained server bundle the run stage copies.
ENV NEXT_STANDALONE=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Outside the app directory so a redeploy cannot land on top of it.
ENV QT_DB_PATH=/data/qt-passport.db

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 \
 && mkdir -p /data && chown nextjs:nodejs /data

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

# The standalone bundle contains only the server, but the first accounts have
# to be created from inside the container. scripts/admin.mjs does that with
# bare `node` and no dependencies.
#
# An earlier version installed a TypeScript runner here so the .ts scripts
# could run. It did not survive into the running image, which left the app
# live with no way to create an account and nobody able to sign in. Plain
# JavaScript removes that failure entirely.
COPY --from=build --chown=nextjs:nodejs /app/scripts/admin.mjs ./scripts/admin.mjs

USER nextjs
EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "server.js"]
