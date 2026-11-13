# 0006. Glance version pinning and upgrade policy

- **Status:** accepted
- **Date:** 2026-10-13
- **Decider:** PM
- **UX impact:** **yes**. Pinning decides which widgets and options the editor offers, and whether you see a warning when your live Glance version differs.

## Context
- Latest Glance release on 2026-10-13: **v0.8.6** (2026-09-03). Before it: v0.8.5 (2026-05-30) and v0.8.4 (2025-06-10).
  Releases are infrequent.
- The editor's generator, the widget catalogue and the validation behaviour (ADR-0009) are all specific to one Glance version.
- **Your live Glance version is unknown.** If it runs `:latest`, it can move ahead of the editor without warning.

## Proposal
1. **Single pin file** `/glance.version`: tag plus digest. Current value:
   `glanceapp/glance:v0.8.6@sha256:9dfb09470b207dcb67ac715994bdb1929374ba3f9c0d7df7462c24adf10fd073`
   (digest from `docker image inspect … RepoDigests` on 2026-10-13, pulled on amd64).
   CI, the test harness and the editor image (validator binary, ADR-0001) all read it.
2. **Live Glance should be pinned to the same tag**, not `:latest`. A todo for you.
3. **Version check (UX):** the editor shows its supported Glance version in Settings. If it can learn the live
   version (method not yet found; `/api/healthz` doesn't expose it, source v0.8.6), it warns on mismatch. Otherwise
   it shows a static note.
4. **Upgrade policy:**
   - Claude checks Glance releases at the start of each phase, and when you ask.
   - The upgrade is a dedicated PR: bump `/glance.version`; diff `docs/configuration.md` between the old and new
     tags; rerun fixtures plus the reload tests; update ADR-0009 with fresh results (a new ADR if behaviour changed);
     add or adjust widget schemas; write a release-notes entry.
   - Patch releases: upgrade within one phase if CI is green. Minor and major releases: an ADR plus your approval.
   - You upgrade the live Glance **after** the editor release that supports it, never before.
5. Only one Glance version is supported at a time.

## Alternatives considered
- Supporting a range of Glance versions: more test matrix and conditional generator code. Not worth it for one user.
- Renovate/Dependabot auto-PRs for the pin: possible later. It still needs the manual docs diff.

## Verified vs assumed
- Verified: the release list and dates (GitHub API), the image digest (local pull). Both 2026-10-13.
- Not verified: an arm64 digest (relevant if your host is ARM); a way to read the live Glance version.

## Decision record
**Accepted 2026-10-13 by the PM (via chat)**, with this clarification:
- The pin applies to the **Glance that this project deploys** (the new stack, Phase 7). The PM's current Glance on Unraid
  (`glanceapp/glance`, i.e. `latest`) is **not changed**. It is replaced at cutover.
- Point 2 above ("live Glance should be pinned to the same tag") therefore means: the new stack's Glance is pinned. No
  action on the current instance.

**2026-11-13:** the pin moved to v0.8.8 (ADR-0036, accepted by the PM). `/glance.version` holds the current value.
