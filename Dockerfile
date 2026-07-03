# Optional — for Docker-based hosts (Fly.io, a VPS, etc.).
# Railway/Render auto-detect Next.js and don't need this file.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Build-time env is not needed; the app reads secrets at runtime.
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
# Copy the built app and its dependencies.
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts
EXPOSE 3000
ENV PORT=3000
CMD ["npm", "run", "start"]
