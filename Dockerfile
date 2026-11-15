# Stage 1: Frontend build (React + Vite -> dist/)
FROM node:22-alpine AS frontend

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json vite.config.ts index.html ./
COPY client ./client
COPY shared ./shared
COPY public ./public

RUN npm run build

# Stage 2: Rust server build (dist/ is embedded into the binary)
FROM rust:1-alpine AS server

RUN apk add --no-cache musl-dev

WORKDIR /app

COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY src-server ./src-server
COPY --from=frontend /app/dist ./dist

RUN cargo build --release --locked

# Stage 3: Minimal runtime
FROM alpine:3.20 AS runner

WORKDIR /app

ENV PORT=3000
ENV DATA_DIR=/app/data

COPY --from=server /app/target/release/notika /usr/local/bin/notika

RUN mkdir -p /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["notika"]
