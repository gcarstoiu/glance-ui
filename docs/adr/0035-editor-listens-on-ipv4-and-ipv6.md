# 0035. The editor listens on IPv4 and IPv6 by itself

- **Status:** accepted by the PM, 2026-11-03 (via chat): option B, as recommended.
- **Date:** 2026-11-03
- **Decider:** PM
- **UX impact:** yes: how the container behaves on a network with IPv6, and which variables are the user's.
- **Amends:** ADR-0024 (the all-in-one container); replaces the `HOST` setting from PR #41 before any release.

## Context
- On a Docker network with IPv6, the editor's published port accepts an IPv6 connection and the browser gets an empty
  reply. A host name that resolves to IPv6 first (an mDNS `.local` name, say) never shows the editor. An outside
  contribution, PR #41, found this and passed a container variable `HOST` to the editor (`HOST=::`).
- adapter-node 6.0.0 listens on `HOST`, `0.0.0.0` (IPv4 only) when unset, and on `PORT`, `3000` when unset
  (`src/index.js` 10-11 and 91, read 2026-11-03). Glance listens on `:8080`, IPv4 and IPv6 alike (PR #41, tested).
- Tested on 2026-11-03 with an image built from main (605e541):
  - `HOST=::` on an IPv6 network: the editor answers over IPv4 and IPv6; on a network without IPv6 it starts too.
  - A container variable `HOST` meant for the user's own `${HOST}` (an address or a name): the editor can't listen
    (`EADDRNOTAVAIL`, `ENOTFOUND`) and is restarted every 30 s, without end. The README says the user's own
    variables go to Glance, not the editor.
- `PORT` had the same clash before PR #41: `image/start.ts` gave the editor the container's `PORT`, so a user's own
  `PORT` moved the editor away from 3000, where every port mapping and the health check point (tested on v1.5.0 with
  `test/editor-listen.sh`: the editor didn't answer on 3000 and the health check failed). The image's own
  `ENV PORT=3000` also beat a `PORT` in the user's `.env`, so Glance got 3000 (ADR-0025: the container's variables
  win; tested the same way).

## Options shown to the PM
- **A.** Rename the setting to `EDITOR_HOST`.
- **B.** No setting: the editor listens on IPv4 and IPv6 whenever the container can, otherwise on IPv4 only, as Glance
  does; `HOST` and `PORT` go to Glance only.
- **C.** Keep `HOST` as merged and warn in the README that the name is taken.

## Decision
- **B.** The start program opens a test socket on `::` before it starts the editor. If that works, the editor gets
  `HOST=::` (IPv4 and IPv6); if not (a kernel without IPv6), `HOST=0.0.0.0`. The log says which.
- The editor always listens on 3000 inside the container. The image no longer sets `PORT`.
- A container variable named `HOST` or `PORT` is the user's, for Glance, like any other.

## Consequences
- Nobody has to know about IPv6: the contributor's case works without a setting, and so does Unraid with IPv6.
- No new exposure: Docker already published the port on IPv6; the editor now answers there instead of resetting.
- `test/editor-listen.sh` checks, on the image: IPv4 and IPv6 from another container; the user's `HOST` and `PORT`
  reach Glance and leave the editor alone; IPv4 only when the container can't open IPv6 sockets (a seccomp profile
  stands in for a kernel without IPv6); `net.ipv6.bindv6only=1` keeps IPv4 working.
