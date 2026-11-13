# 0009. Glance v0.8.6 behaviour baseline (verified facts)

- **Status:** accepted
- **Date:** 2026-10-13
- **Decider:** PM
- **UX impact:** yes. It confirms the explicit-Save model and sets how the project's own Glance mounts its config.

## Context
The editor's design depends on how Glance loads config. The brief listed facts from `docs/configuration.md`
on `main`. This ADR re-checks each one against the pinned version (ADR-0006) and records how it was checked.

**Sources** (all read 2026-10-13):
- `glanceapp/glance` release **v0.8.6** (published 2026-09-03, commit `fbd9c1b6ae0c50ec015843f1bea48c400cddb518`).
- `docs/configuration.md` at tag v0.8.6. Byte-identical to `main` on 2026-10-13.
- Source at v0.8.6: `internal/glance/cli.go`, `config.go`, `widget-docker-containers.go`, `glance.go`.
- Image `glanceapp/glance:v0.8.6@sha256:9dfb0947…0fd073` (full digest in `/glance.version`).
- Tests: `test/validate-fixtures.sh` and `test/glance-reload.sh`, run locally on 2026-10-13
  (Docker 29.8.0 rootful, CachyOS, amd64; corrected from "rootless" on 2026-10-13). The smoke test `test/glance-smoke.sh` was run locally the same day.

## Results

| # | Brief's claim | Docs v0.8.6 | Tested on v0.8.6 | Result |
|---|---------------|-------------|------------------|--------|
| 1 | Config hot-reloads on save | Yes ("Auto reload") | Yes: in-place write reloads within about 1 s | **Confirmed** |
| 2 | `$include`d files hot-reload too | Yes | Yes: an edit to an included file reloads | **Confirmed** |
| 3 | Env-var changes need a restart | Yes | Not tested | Docs only |
| 4 | Invalid config at runtime: error logged, old config kept | Yes | Yes: container keeps running, old page still served, error in log | **Confirmed** |
| 5 | Invalid config at startup: exits **with an error** | Yes | **Partly wrong.** It logs `Config has errors: …` and exits with **code 0** | **Differs**: exit code is 0 |
| 6 | Reloads clear cached data | Yes | Not tested | Docs only |
| 7 | `${VAR}`, `${secret:name}`, `${readFileFromEnv:VAR}` exist | Yes, plus `\${…}` escapes a literal | All four pass `config:validate` when the env/files exist | **Confirmed** (Glance side only) |
| 8 | Missing env var is an error | Yes: Glance won't start, or won't load the new config | Yes: `config:validate` fails with "environment variable … not found" | **Confirmed** |
| 9 | Up to 3 columns per page | Yes | 4 columns rejected: "page 1 has more than 3 columns" | **Confirmed** |
| 10 | 1 or 2 columns must be `full` | Yes | 0 and 3 full columns both rejected | **Confirmed** |
| 11 | `small` column is 300px | Yes | Not tested (visual) | Docs only |
| 12 | `width: slim` allows at most 2 columns | Yes | 3 columns on slim rejected | **Confirmed** |
| 13 | `group` cannot contain `group` or `split-column` | Yes | Both rejected | **Confirmed** |
| 14 | Containers via `docker-containers` → `containers` map keyed by container name, supports `hide` | Yes | Accepted by `config:validate`; not rendered against real containers | **Confirmed** (schema only) |
| 15 | Precedence of `containers` map vs `glance.*` labels | **Undocumented** | Not tested (no socket in the test harness yet, see ADR-0005) | **Source reading only**, see below |

### Additional facts found (not in the brief)
- **`config:validate` CLI command** exists in v0.8.6. It is listed in `glance --help` but not in configuration.md.
  It exits 1 on an invalid config and 0 on a valid one (tested). The editor can use it to validate before writing.
- **Atomic replace (write a temp file, then rename) reloads correctly** when the *directory* holding the config is
  bind-mounted (tested). The source handles fsnotify `Rename` by waiting up to 2 s for the file to reappear.
- **A single-file bind mount does not see an atomic replace.** With `-v ./glance.yml:/app/config/glance.yml`,
  the rename was never picked up (tested). The container keeps the old inode, which is standard Docker behaviour.
  → The live Glance must mount the config **directory** if the editor writes atomically.
- Docs: "Deleting a config file will stop that file from being watched, even if it is recreated." The
  rename handling above did not show this problem in the directory-mount test, but the editor should never
  delete the config file.
- **`config:print` keeps placeholders and comments literal** and inlines `$include` files. It exits 0 even when
  referenced env vars are missing (tested). This is useful for import (ADR-0011).
- A leading `#` comment header passes `config:validate` (tested).
- Reload is debounced by 500 ms (source, `config.go`).
- `GET /api/healthz` exists (source, `glance.go`). It shows Glance is up, not which config it loaded.
- The image's entrypoint is `/app/glance --config /app/config/glance.yml` (Dockerfile at v0.8.6).

### Docker label precedence (item 15): source reading, not a test
In `fetchDockerContainersFromSource` (v0.8.6), after the containers are listed, each entry in the `containers` map
is applied as `container.Labels["glance."+key] = value`. This overwrites any existing label. Container names are
matched after trimming the leading `/`. Category filtering and the hide check run afterwards. So the source suggests
**the config map wins over labels**, for every key including `hide` and `category`. This must be confirmed by a test
against real labelled containers before the editor depends on it (Phase plan, Phase 4).

## Consequences for the editor
1. **Explicit Save only** (per the brief, and backed by fact 6, which is from the docs only).
2. **Validate before writing**: run the pinned `glance config:validate` on the generated YAML, and refuse to write if it fails.
3. **Never rely on Glance's exit code** to detect a bad startup config (fact 5). CI's smoke test treats any exit as a failure.
4. **Write atomically, and mount the config directory** in the Glance that this project deploys. The PM's current Unraid
   Glance mounts the single file, but it is replaced at cutover rather than changed (clarified 2026-10-13), so this needs no change on the PM's side.
5. **Placeholders** must be stored and written back literally, including `\${…}` escapes. Glance resolves them,
   so the editor never needs their values. A placeholder whose env var is missing on the live host will make Glance
   reject the config. The editor cannot detect this (it cannot see Glance's environment).
6. Post-save confirmation that Glance actually loaded the new config is not possible from `/api/healthz` alone.
   Options are in ADR-0008.

## Verified vs assumed
- Verified by test: items 1, 2, 4, 5, 7, 8, 9, 10, 12, 13, 14 (schema), atomic-rename behaviour, `config:validate` exit codes, `config:print` placeholder handling, comment header.
  Scope: one machine, rootful Docker, amd64, image digest above.
- Docs only: 3, 6, 11.
- Source only: 15, debounce, healthz.
- Not checked: arm64 image, Docker on the live host, Windows/macOS hosts, behaviour with Glance `auth` enabled.

## Re-run on v0.8.8 (2026-11-13, ADR-0036)
- Same machine (Docker 29.8.0, amd64), image `glanceapp/glance:v0.8.8@sha256:4d7445bc…1943bb`: every harness script
  passed unchanged (fixtures, upstream example, CLI and placeholders, hot reload and the reload signal, the map over
  labels, the socket proxy, the all-in-one container). Fact 5 still holds: an invalid config at start is logged and
  Glance exits with code 0 (checked by hand).
- New: a Reddit widget with `search` and no `app-auth` is invalid; a title link or a container's link with a scheme
  other than http, https or mailto is written as `#ZgotmplZ`; a child container isn't filtered by the widget's
  category. Details and tests in ADR-0036.

## Decision record
**Accepted 2026-10-13 by the PM (via chat)**, with the clarification in consequence 4 (our own Glance mounts the config directory; the current one is replaced, not changed).
