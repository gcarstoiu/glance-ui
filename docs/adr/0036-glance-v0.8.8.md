# 0036. Glance v0.8.8

- **Status:** accepted by the PM, 2026-11-13 (via chat): the upgrade, with the three recommendations below.
- **Date:** 2026-11-13
- **Decider:** PM
- **UX impact:** yes: Glance's changes reach existing dashboards; a new error and a new warning on Review; new lines in
  the Containers section.
- **Amends:** ADR-0006 (the pin moves to v0.8.8), ADR-0009 (re-run on v0.8.8).

## Context
- After v0.8.6, Glance released v0.8.7 (2026-10-15) and v0.8.8 (2026-11-07): fixes and security fixes (release notes
  on GitHub, read 2026-11-13). The source diff from v0.8.6 (`fbd9c1b`) to v0.8.8 (`53aec7f`) touches 38 files; the
  widget types, built-in themes, `LICENSE` and `docs/glance.yml` are unchanged (read 2026-11-13).
- Changes that reach the editor (source read 2026-11-13; how each was tested in brackets):
  1. **Reddit:** `search` without `app-auth` is refused (v0.8.7, `widget-reddit.go` `initialize`), by
     `config:validate` (exit 1) and at start (still exit code 0). v0.8.6 accepts it. [binary, both versions] After an
     update, a dashboard with such a widget doesn't load until the widget is fixed. [upgrade test below]
  2. **Links:** `widget-base.html` (every widget's title link) and `docker-containers.html` (a container's link) no
     longer mark the link as safe, so Go's `html/template` writes `#ZgotmplZ` for a link whose scheme isn't `http`,
     `https` or `mailto`: the text before the first `:` counts as a scheme unless it contains `/`, in any case
     (go1.27.3 `src/html/template/url.go` `isSafeURL`; the v0.8.8 binary names go1.27.3). `localhost:8080` without
     `http://` is dropped too. Bookmarks and Monitor links still allow any scheme. [title links:
     `packages/glance/test/links.test.ts`; a container's label: `test/glance-docker.sh`, which fails on v0.8.6]
  3. **docker-containers:** a child (`glance.parent` set, `glance.id` not) is no longer dropped by the widget's
     `category`; it is listed under each listed container whose `glance.id` it names (v0.8.8
     `groupDockerContainerChildren`). [`test/glance-docker.sh`, fails on v0.8.6] The Containers section didn't model
     children at all, so it showed every child as listed on its own.
  4. **Search:** `brave` is a known search engine name. [source]
  5. Not shown in the editor: a response a widget reads is capped at 10 MB; the server has a 5 s header and 10 s read
     timeout; a login body is capped at 512 KB; page routes check login before "not found". [source; the preview,
     which the editor fetches with a 60 s timeout, passes its tests]

## Options shown to the PM (2026-11-13)
1. Upgrade to v0.8.8 (recommended), or stay on v0.8.6.
2. Reddit Search without App authentication: **(a)** an error on Review at the Search field, with Go to, and a help
   line on the field (recommended); (b) Glance's own message at Save only.
3. Links Glance turns into dead links: **(a)** a warning on Review, not a block (recommended); (b) release notes only.
4. The Containers section shows children as Glance does, under their parent ("Shown under <parent>").

## Decision
- **v0.8.8**, with 2(a), 3(a) and 4.
- Error `reddit.search-needs-app-auth` at the Search field, when Search is set and none of App authentication's three
  values is (a partly filled one already has its own error, as in Glance). The field's help: "Works only with App
  authentication, since Reddit changed its API."
- Warning `link.dropped` on a widget's title link and on a container's link in the widget's `containers` map:
  "Glance makes this a dead link: it keeps only links that start with http://, https:// or mailto:, or paths on this
  server." A link with a placeholder before its first `:` isn't judged. A `glance.url` label on the container itself
  isn't in glance.yml, so it isn't on Review.
- Containers section: a child shown by Glance reads "Running · shown under “Name”". Lines by Claude for the rest: "Not
  shown: Glance lists it under “Name”, which isn’t shown" and "Not shown: Glance lists it under the container with
  glance.id “x”, and there is none".
- Messages that name Glance's version take it from the pin (`GLANCE_VERSION`, generated from `/glance.version`).
- The release notes say that a Reddit widget with Search and without App authentication stops the dashboard loading
  after the update, until Search is cleared or App authentication filled in.

## Consequences
- Upgrade test (2026-11-13, image built from this branch): a dashboard saved on v1.5.1 with such a Reddit widget
  served its page; after starting the new image on the same data folder, the dashboard didn't answer, Glance was
  started again with growing pauses (2 s, 4 s, 8 s…), the editor answered and listed the error, and after Search was
  cleared and saved the dashboard answered again.
- The Search field of a Reddit widget that has no App authentication now blocks Save. On v0.8.6 the widget fetched
  nothing anyway (v0.8.7's notes: fixed "after recent API changes"; not tried, it needs Reddit).

## Verified vs assumed
- Verified by test (amd64, Docker 29.8, 2026-11-13): items 1 to 3, the whole suite with `GLANCE_EDITOR_IMAGE` set,
  the upgrade test, Glance's exit code 0 at start.
- Source only: items 4 and 5.
- Not verified: the arm64 image (only amd64 was pulled; `docker buildx` isn't installed to read the index), Reddit
  itself.

## Decision record
**Accepted 2026-11-13 by the PM (via chat):** upgrade to v0.8.8 with the recommendations 2(a), 3(a) and 4.
