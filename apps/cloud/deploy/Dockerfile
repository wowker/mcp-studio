FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS web
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/web apps/web
COPY contracts contracts
RUN npm run build
FROM golang:1.25.5-bookworm@sha256:d9132cce84391efab786495288756d60e1da215b1f94e87860aeefc3d4c45b6d AS go
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd cmd
COPY internal internal
COPY migrations migrations
COPY contracts contracts
RUN CGO_ENABLED=0 go build -trimpath -o /out/platform ./cmd/platform && CGO_ENABLED=0 go build -trimpath -o /out/studio-admin ./cmd/studio-admin
FROM caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d
COPY --from=go /out/platform /app/platform
COPY --from=go /out/studio-admin /app/studio-admin
COPY --from=web /src/apps/web/dist /app/web
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/app/platform"]
