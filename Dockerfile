# Glance Editor image. Build with scripts/build-editor-image.sh (it passes the pinned Glance image from /glance.version).
ARG GLANCE_IMAGE
ARG NODE_IMAGE=node:24-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

FROM ${GLANCE_IMAGE} AS glance

FROM ${NODE_IMAGE} AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/model/package.json packages/model/
COPY packages/generator/package.json packages/generator/
COPY packages/glance/package.json packages/glance/
COPY apps/editor/package.json apps/editor/
RUN npm ci --no-audit --no-fund
COPY glance.version tsconfig.base.json ./
COPY packages packages
# The server reads .env the way the container does (ADR-0029): one parser, shared with image/start.ts.
COPY image/dotenv.ts image/
COPY apps/editor apps/editor
RUN npm -w apps/editor run build

FROM ${NODE_IMAGE}
ARG GLANCE_COMMIT
ARG GLANCE_VERSION
LABEL org.opencontainers.image.title="Glance Editor" \
      org.opencontainers.image.licenses="GPL-3.0-only" \
      org.glance-editor.glance-commit="${GLANCE_COMMIT}"
# Unmodified glance binary (AGPL-3.0, source: github.com/glanceapp/glance at the commit above): the editor's
# `config:validate` (ADR-0001, ADR-0013), and your Glance and the preview Glance in the all-in-one container (ADR-0024).
COPY --from=glance /app/glance /usr/local/bin/glance
# Glance (Go) verifies HTTPS sites against the system's CA certificates, and node:slim has none: weather, RSS and every
# other widget that fetches from the web failed with "x509: certificate signed by unknown authority". The bundle from
# Glance's own pinned image is the one Glance ships with. (The editor runs on Node, which has its own.)
COPY --from=glance /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY third_party/glance/LICENSE third_party/glance/README.md /usr/share/doc/glance/
COPY LICENSE /usr/share/doc/glance-editor/LICENSE
WORKDIR /app
COPY --from=build /src/apps/editor/build build
COPY image/start.ts image/docker-gate.ts image/dotenv.ts image/listen.ts image/
# ADR-0024: only root reaches /run, so the editor (PUID) can't open the Docker socket mounted at /var/run/docker.sock,
# whatever its permissions; and no setuid program can make it root.
RUN echo '{"type":"module"}' > package.json \
 && chmod 0700 /run && find / -xdev -perm -4000 -type f -exec chmod u-s {} +
# No PORT or HOST: the start program sets them for the editor (ADR-0035); without them, `node build` uses 3000.
ENV NODE_ENV=production GLANCE_BIN=/usr/local/bin/glance GLANCE_VERSION=${GLANCE_VERSION} \
    GLANCE_CONFIG=/glance-config/glance.yml EDITOR_DATA_DIR=/data BODY_SIZE_LIMIT=100M
# Starts as root: image/start.ts runs Glance and the Docker gate, and the editor as PUID:PGID (default 99:100).
# Editor only (tests, dev, the four-container layout): run `node build` with --user.
ENV PUID=99 PGID=100
EXPOSE 8080 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "/app/image/start.ts"]
