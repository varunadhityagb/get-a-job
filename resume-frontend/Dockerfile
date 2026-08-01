# Stage 1 — build the static bundle
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
# VITE_API_BASE is a *build-time* env var (Vite inlines it at build), but
# we deliberately do NOT set one here — src/api.js already falls back to
# window.location.hostname:8000 at runtime, which is what we want for a
# LAN tool accessed from different devices/IPs. Only pass --build-arg
# VITE_API_BASE if you need to hardcode a fixed backend address instead.
ARG VITE_API_BASE=""
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build

# Stage 2 — serve the built files
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
