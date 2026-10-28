# To do: Claude

Claude's own backlog. Items that need the PM go in [todo-user.md](todo-user.md) instead.

## Waiting on the PM
- [x] Both CI jobs passed on PR #1 (2026-10-13). Required check names: `Tests`, `Glance accepts generated config`.
- [ ] Verify the design handoff path with the PM's sample (ADR-0012), and archive it to `design/handoffs/`.
- [ ] Add the live host details to Phase 7 docs once provided (keep addresses out of the public repo).

## Phase 11
- [x] Before the Community Apps submission: a CA template repository layout (`ca_profile.xml`, icon, templates) per
      ca.unraid.net/submit/help/builders: `gcarstoiu/unraid-templates`. Validate and Scan run when the PM submits it.
- [ ] After the PM's first Unraid install: record what the Docker tab showed (icon, WebUI, update check) in ADR-0024.

## Phase 1 (done in the Phase 1 PR; kept for the record)
- [x] Check for a newer Glance release than v0.8.6 (ADR-0006).
- [ ] Phase 3: check `node:sqlite` stability for the pinned Node (ADR-0002).
- [x] Build the `glance-editor:dev` image so `dev/up.sh` runs the editor on port 18190.
- [x] Confirm the SvelteKit 3 / TypeScript 6 peer range still holds at implementation time.
- [x] Prove the copied static `glance` binary runs in the Node base image (ADR-0001).
- [x] Prove `config:validate` with dummy placeholder values (ADR-0008 step 2).
- [ ] Get an arm64 digest for the pinned Glance image if the host is ARM.

## Licensing (ADR-0013)
- [x] Phase 1: add a dependency-license check to CI (GPL-3.0-compatible only): `npm run licenses`.
- [x] Phase 7: the published editor image ships Glance's AGPL license text plus a pointer to the pinned source commit
      (Phase 11: `/usr/share/doc/glance/`, checked in CI and the release workflow).

## Phase 11 (deployment) notes from Phase 3
- [x] The editor runs as uid 1000 (`node`); on Unraid the config dir and data dir ownership (often 99:100) must allow it to write. Decide user/permissions in the deployment ADR.
      ADR-0024: the editor runs as PUID:PGID, 99:100 by default (`image/start.ts`).
- [x] `GLANCE_URL` must point at Glance as reachable from the editor container (same Docker network).
      One container (ADR-0024): `http://127.0.0.1:8080/` (`image/start.ts`).

## Known gaps in the Phase 0 harness
- [ ] The docker-containers precedence test needs a socket proxy plus labelled throwaway containers (Phase 6).
- [ ] The "reload clears cache" and "env-var change needs restart" claims are not tested (docs only).
- [ ] CI pulls the Glance image without a cache. Consider caching if it becomes slow.
- [ ] CI installs Playwright's Chromium on every run; once (2026-10-26) that took 13 minutes and main's job hit its
      15-minute limit. Cache the browser if it happens again.
