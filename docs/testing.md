# Testing

## Safety: the harness never touches the live dashboard
- Every container the harness starts is named `glance-editor-test-*` and labelled `glance-editor-test=1`.
  Cleanup only removes containers with that label.
- Ports are `127.0.0.1:18080` (smoke), `127.0.0.1:18081` (reload) and others in the 18xxx range (one per script). They are never published on other interfaces.
- No Docker socket is mounted into test containers, except in `test/glance-docker.sh` (read-only, into a test Glance
  that only lists containers) and `test/docker-proxy.sh` (read-only, into the pinned socket proxy, which refuses every
  write). The throwaway containers they list carry the test label.
  CLI checks run with `--network none`.
- Configs come only from `test/fixtures/`, copied to a fresh `mktemp -d`. Nothing reads or writes the live config path.
- If `DOCKER_HOST` is set, the harness refuses to run (so it can't be pointed at the Glance host by accident).
  Override only for a disposable daemon: `GLANCE_EDITOR_TEST_ALLOW_DOCKER_HOST=1`.
- The live instance's real config is never a fixture. A redacted copy, provided by the PM, may become one.

## Commands (run from the repo root; the scripts are bash, so they work from fish/zsh too)
| Command | What it checks | Time |
| ------- | -------------- | ---- |
| `scripts/test.sh` | Everything below except the smoke test, plus typecheck, license gate, shellcheck | ~80 s |
| `npx vitest run packages/document` | Import, round trip (byte-identical), targeted edits, random edit sequences (property, 1,500 per run), spliced output rendered by real Glance. On a property failure, set `GLANCE_EDITOR_PROPERTY_DUMP=<file>` to record the failing op sequences | ~60 s |
| `npx vitest run packages/document/test/widget-schema.test.ts` | Every widget schema against the real binary: required and docs-required fields, enum options (strict vs soft), every key's existence (wrong-typed value must fail), cross-field rules, import → generate of each sample, built-in themes | ~3 s |
| `node scripts/glance-source-data.ts --check` | The checked-in widget type list and themes match Glance's source at the pinned commit (needs network; part of `scripts/test.sh`) | ~1 s |
| `npx vitest run` | Model rules, placeholder parser, generator (incl. a 2,000-run property test), validation and render tests against the **real pinned binary** (`GLANCE_BIN`, extracted from the image by `scripts/fetch-glance-binary.sh`) | ~5 s |
| `npx playwright test` | The editor UI end to end (`test/e2e`): builds the app, then per test a temp config dir, a real Glance on it and the built editor. Flows 1, 2, 3, 4 (with the icon finder, using stand-ins for its online sources), Pixabay (a stand-in for its API), 5 (Hide a container, with a stand-in for the Docker socket proxy that the real Glance reads too), 6, 7, 8 (Preview, with a second real Glance as the preview Glance) and 9 (colours), the YAML override, keyboard-only widget editing, the background (Glance's page read from screenshots: the image, both slideshow images, the Preview frame), and every Phase 5 to 10 error/empty state, at 1280 px and 390 px, with axe (WCAG 2.1 A/AA) and a 44 px target check on each screen. `E2E_SKIP_BUILD=1` reuses the last build; `E2E_SCREENSHOTS=<dir>` saves screenshots. Part of `scripts/test.sh` | ~40 s |
| `ICON_LIVE=1 npx vitest run packages/server/test/icons-live.test.ts` | The icon finder against the **real** services (jsDelivr name lists and previews, Iconify, Openverse, Wikimedia Commons, a real site icon). Needs the internet; not in CI or `scripts/test.sh`. Run it when touching `packages/server/src/icons.ts` | ~10 s |
| `test/validate-fixtures.sh` | `glance config:validate` passes every `fixtures/valid/*` and fails every `fixtures/invalid/*` | ~3 s |
| `test/upstream-example.sh` | Glance's own example config at the pinned commit: download, checksum, `config:validate` | ~2 s |
| `test/glance-cli.sh` | `config:print` keeps placeholders and comments literal and inlines includes; a comment header validates | ~2 s |
| `test/glance-reload.sh` | Hot-reload, invalid-config handling, atomic rename, includes, file-vs-directory mount | ~15 s |
| `test/glance-docker.sh` | docker-containers widget: the `containers` map beats a `glance.hide` label (design D-23) | ~5 s |
| `test/docker-proxy.sh` | The pinned Docker socket proxy with the editor's settings (`/docker-proxy.version`): lists containers; refuses POST (create, stop, kill, exec), DELETE and the API sections the editor doesn't use (403); a Glance pointed at it lists the same containers. With `GLANCE_EDITOR_IMAGE` set (CI), the editor image lists them through it and passes on only `glance.*` labels | ~10 s |
| `test/editor-api.sh` | The editor **image** end to end: a Glance container watches the config dir the editor writes; import, edit, save (reload confirmed), versions, restore, `Origin`/JSON checks. Needs `GLANCE_EDITOR_IMAGE` (CI sets it) | ~15 s |
| `GLANCE_EDITOR_IMAGE=<image> test/editor-listen.sh` | Where the all-in-one container's editor listens (ADR-0035), from a second container on a Docker network with IPv6: IPv4 and IPv6 by default; a user's own `HOST` and `PORT` reach Glance and leave the editor on 3000; IPv4 only when the container can't open IPv6 sockets (a seccomp profile stands in for a kernel without IPv6); `net.ipv6.bindv6only=1`. In CI and in `scripts/test.sh` when the image is set | ~20 s |
| `GLANCE_EDITOR_IMAGE=<image> test/community-live.sh [folders]` | Every community widget set up through the editor's UI in a throwaway all-in-one container (ADR-0030): fields filled in as a user would, Add, Save, Glance's page read; a stand-in server records what each widget requests. Fails if one can't be added, stops the dashboard or doesn't show. The report (`summary.txt`, one JSON per variant) lists what each widget shows with the stand-in's empty answers, and typed values no request carried. Run it when moving the community-widgets pin; not in CI or `scripts/test.sh` (it needs the internet for widgets that call public services) | ~15 min |
| `test/glance-smoke.sh [config]` | Starts Glance and fails if it exits or never serves (exit code is ignored, see lessons). Uses `test/fixtures/model/v2/sample.env` and `secrets/` for placeholders | ~6 s |

The Glance image comes from `/glance.version`, the socket proxy from `/docker-proxy.version` (tag plus digest). Requirements: Docker, curl, bash 4+.

## Fixtures
- `test/fixtures/valid/`: must pass `config:validate`. `sample.yml` is the CI smoke config and covers every structure
  the editor will generate. It avoids network-dependent widgets (e.g. weather fails at startup on an invalid location).
- `test/fixtures/invalid/`: each file breaks exactly one documented rule. The header comment says which.
- `test/fixtures/support/`: dummy env/secret files for `placeholders.yml`. They are not secrets.
- `test/fixtures/import/`: import fixtures. `commented.yml` has comments everywhere, an anchor and merge key, a flow list, a
  block scalar, an escape in double quotes, a typo key and an unrepresentable value. `includes/` covers `$include`, `!include`, nesting.
- `test/e2e/fixtures/`: configs for the UI tests. `{{GLANCE_PORT}}` in `home.yml` becomes the test Glance's port.
- `test/fixtures/model/v1/`, `v2/`: editor-model fixtures, one folder per schema version, kept forever for migration
  tests (ADR-0003). `v2/sample.json` (current) covers a range of widget types, typed and untyped placeholders and an escape.

Add a fixture whenever a Glance rule or behaviour is relied on. Cite the ADR in the fixture's header comment.

## CI (`.github/workflows/ci.yml`)
1. **Tests**: `npm ci`, then `scripts/test.sh`.
2. **Glance accepts generated config** (after Tests): the real generator on `test/fixtures/model/v2/sample.json`, then `test/glance-smoke.sh`.
3. **Editor image builds and starts** (after Tests): `scripts/build-editor-image.sh`, `/healthz` must report the glance binary present, then `test/editor-api.sh` against the image.
