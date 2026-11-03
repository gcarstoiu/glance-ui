#!/usr/bin/env bash
# Entry point for "run the tests", locally and in CI.
# Node checks first (fast), then the Docker-based Glance harness.
set -euo pipefail
cd "$(dirname "$0")/.."

# Pinned shellcheck via Docker so local runs and CI behave the same.
SHELLCHECK_IMAGE="koalaman/shellcheck:v0.11.0@sha256:61862eba1fcf09a484ebcc6feea46f1782532571a34ed51fedf90dd25f925a8d"
echo "== typecheck";                npm run --silent typecheck
echo "== dependency licenses";      npm run --silent licenses > /dev/null
echo "== Glance source data";       node scripts/glance-source-data.ts --check
echo "== Glance license in image";  (source glance.version; echo "$GLANCE_LICENSE_SHA256  third_party/glance/LICENSE" | sha256sum -c --quiet) # ADR-0013
echo "== Community Apps files";     d="$(mktemp -d)" && scripts/render-community-apps.sh example/glance-ui example/unraid-templates 1.0.0 "$d" > /dev/null && rm -rf "$d"
echo "== unit + Glance tests";      npx vitest run
echo "== UI end to end";            npx playwright test # builds the editor; desktop and 390 px phone (test/e2e)
echo "== shellcheck"
docker run --rm --network none -v "$PWD:/mnt:ro" -w /mnt "$SHELLCHECK_IMAGE" -x scripts/*.sh test/*.sh dev/*.sh

echo "== fixture validation";      test/validate-fixtures.sh
echo "== upstream example";        test/upstream-example.sh
echo "== Glance CLI behaviour";    test/glance-cli.sh
echo "== hot-reload behaviour";    test/glance-reload.sh
echo "== docker-containers";       test/glance-docker.sh
echo "== Docker socket proxy";     test/docker-proxy.sh # with GLANCE_EDITOR_IMAGE set, also the editor image
if [[ -n "${GLANCE_EDITOR_IMAGE:-}" ]]; then
  echo "== all-in-one container";  test/all-in-one.sh # ADR-0024, the Unraid install
  echo "== editor listen address"; test/editor-listen.sh # ADR-0035, IPv4 and IPv6
fi
