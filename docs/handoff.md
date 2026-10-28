# Handoff

The single place to see where the project stands. Updated at the end of every work session and every PR.
Last updated: 2026-10-28 (end of session: v1.5.0 released, ADR-0034 compact widgets; local clean-up).

## Current state
- **Released:** **v1.5.0** is `:latest` (`ghcr.io/gcarstoiu/glance-editor`, public). Earlier: v1.0.0, v1.0.1, v1.1.0, v1.2.0,
  v1.3.0, v1.4.0, v1.4.1
  (and test releases v1.0.0-rc.1 to rc.6, kept as pre-releases). Every release page shows its CHANGELOG section;
  every published image passed `test/all-in-one.sh` (including a real HTTPS weather fetch inside the container).
- **v1.0.0 caveat:** PR #18 was merged before its last two commits were pushed, so v1.0.0 lacked "another server's
  containers" and "Fill in icons and links" although its notes describe them. v1.0.1 added them (its notes say so).
  Lesson in `docs/lessons.md`: check a PR is still open before pushing; check every described commit is an ancestor
  of a tag before tagging.
- **The PM's Unraid:** installed and tested up to rc.6 (other servers' containers via a read-only proxy worked). Told to
  switch Repository to `:latest` and update; not confirmed yet which version runs there now.
- **Community Apps:** the public repository **`gcarstoiu/unraid-templates`** (created by Claude at the PM's request,
  2026-10-15) holds `ca_profile.xml`, `templates/glance-editor.xml` (follows `:latest`), `icon.png`, `README.md`,
  `LICENSE` (GPL-3.0), rendered by `scripts/render-community-apps.sh` from v1.4.1 (updated 2026-10-27 through its PR #1). **The PM submits it** at
  https://ca.unraid.net/submit/new (Validate, Scan, Submit); not done yet as far as Claude knows. Possible Scan finding:
  the category value `Productivity: Tools:` is unverified. Re-render and push only when the template itself changes.
- **Merging:** the PM allows Claude to merge PRs once CI is green unless something needs the PM's decision. Release
  notes, live host and cutover stay with the PM. Claude pushes release tags only when the PM has approved the notes
  and asked for the release (done for every release so far).
- **Pinned:** Glance v0.8.6 by digest (`/glance.version`); community widgets at commit 0c643aa
  (`/community-widgets.version`); docker-socket-proxy v0.5.0 (`/docker-proxy.version`).
- **Dev environment:** dev Glance :18180, dev editor :18190 (`docs/dev-environment.md`). It runs an older branch
  (Phase 10b); rebuild with `dev/up.sh` if you need it current.

## What the editor does now (by ADR)
- Phases 1 to 10 (model, import/writer, server, schemas, screens, widgets/theme, preview, containers, icon finder,
  backgrounds, Pixabay): see the phase findings below.
- ADR-0024 one container (editor, Glance, preview Glance, Docker gate) with an Unraid template.
- ADR-0025 first-run upload of a Glance folder as .zip (includes, assets, `.env`).
- ADR-0026 lines switch, background fixes (lvh, blurred fill, top), Edit link in Glance's menu, docs themes in the
  menu, container icon/name/URL/description; another server's containers (follow-up).
- ADR-0027 Fill in icons and links (Unraid icons downloaded, Unraid WebUI resolved, names tidied).
- ADR-0028 community widgets in Add widget (148 of 165 addable, each re-checked against the pinned Glance in tests).
- ADR-0029 values for `${VARIABLES}`: asked for when adding a community widget, a Values screen with an eye, kept in
  `.env` (mode 600), never in glance.yml; Review's warning links to it.
- ADR-0030 every community widget set up with fields: `community-widgets.settings.yml` gives each `${NAME}` a label,
  help and kind and repairs README YAML; More options, Show YAML; a community widget's settings show its title, cache
  and values; a second copy can have its own values (`NAME_2`); values and Save are checked with the real values;
  159 of 165 can be added (6 refused with the reason). Live check: `test/community-live.sh`.
- ADR-0031 drag and drop: links and groups between groups and Bookmarks widgets, widgets into and out of groups and
  split columns, pages, slides; a finger on the grip drags too; Move to… for touch and keyboard.
- ADR-0034 (v1.5.0): compact widgets, a switch on the Theme screen (off by default): each title inside its box, so stacked
  widgets are as far apart as columns; widgets without a box keep their titles above.
- ADR-0033 (v1.4.1): community widgets marked early alpha in Add widget → Community, a community widget's settings, the Unraid
  template's overview and the README.
- ADR-0032 (v1.4.0): a community widget's settings try it against its service, as Glance does, and say why
  it failed in plain words; Uptime Kuma's address and slug are cut out of pasted page addresses; a value a widget needs
  can't be stored empty.
- Favicon in the editor's tab; CA certificates in the image (v1.0.1).

## Resuming (for the next session)
- Read this file, `CLAUDE.md`, `docs/lessons.md` (several traps recorded), and the open items below.
- Git: push with `git -c credential.helper='!gh auth git-credential' push`. Branch per change, PR, CI green, merge
  (`gh pr merge --merge`). Before pushing to a PR branch, check the PR is still open.
- Releases: the PM approves the CHANGELOG section; date it `## [X.Y.Z] - YYYY-MM-DD` on the PR branch; merge; wait
  for main CI; check the PR's head is an ancestor of main; `git tag -a vX.Y.Z` on main and push the tag; the release
  workflow publishes `:X.Y.Z` + `:latest`, the notes and the template; then pull `:latest` and run
  `GLANCE_EDITOR_IMAGE=ghcr.io/gcarstoiu/glance-editor:latest bash test/all-in-one.sh`.
- Privacy (CLAUDE.md rule 6): no names, hostnames, IPs, home paths, session links or real config in the repo, commits
  or PRs; commit trailer `Co-Authored-By` only, no session links in PR bodies (the PM's rule). Exception: the owner's
  GitHub username in the README's install addresses. The PM once pasted a real account ID and domain in chat; they
  must never be written anywhere.
- Local working files (ignored, on the dev machine only): `.spike/` keeps the Glance source at the pinned commit
  (`glance-src`), the community widgets at theirs (`cw-src`), the test caches (Glance binary, Playwright's Chromium)
  and `.spike/run`, which runs a command with its home, temp folder and caches inside `.spike/`. Without them, the
  tests download the binary and the browser again. Only `main` is checked out locally; every branch is on GitHub.
- Stale branches (harmless): `fix/ca-certificates` (PR #21 closed; its commit is in main via #22) and
  `phase-11/findings-2` (its last two commits are in main as cherry-picks via #22). Many merged branches remain on
  the remote; the repo setting "automatically delete head branches" is the PM's (todo-user).
- Screenshots for the README come from `README_SHOTS=docs/screenshots/readme npx playwright test test/e2e/readme.spec.ts`.

## Needs user decision
Nothing below may be built on until you decide. ★ = affects user experience.

- **PR #41, from an outside contributor (opened 2026-10-28):** passes `HOST` to the editor, so it can listen on IPv6
  with `HOST=::` (one line in `image/start.ts`, one row in the README's settings table; unset, nothing changes).
  GitHub holds its CI until you approve the run. Merge, ask for changes, or have Claude review and test it first; its
  release notes line would need your approval. Claude has not commented on it.

- ★ **D-62 reading (confirm, or say otherwise):** in a slideshow, every image of a Pixabay set is a slide, so the
  set's daily/weekly/monthly switch only matters when the background is a single image (ADR-0022). Built this way;
  the alternative (a slideshow showing part of the set and swapping) is a small change.
- ★ **ADR-0025 leftover:** no assets file list in the editor yet (say if wanted).
- ★ **ADR-0026 leftover:** Glance's two default themes stay in the dashboard's theme picker (not answered;
  recommended; hiding them needs CSS).

## Decided on 2026-10-28 (via chat)
| ADR | Outcome |
| --- | ------- |
| [0034](adr/0034-compact-widgets.md) | **Compact widgets:** titles inside their boxes (option B of two, shown with mock screenshots), a switch off by default, released at once |

## Decided on 2026-10-27 (via chat)
| ADR | Outcome |
| --- | ------- |
| [0033](adr/0033-community-widgets-early-alpha.md) | **Community widgets marked early alpha** in the editor and the app's overview; released at once (the PM asked to push and release) |

## Decided on 2026-10-26 (via chat)
| ADR | Outcome |
| --- | ------- |
| [0032](adr/0032-try-a-widget-against-its-service.md) | **Try a widget against its service** automatically when its settings open and after a value is stored; pasted page addresses cut back, with a note (after the PM's "invalid response JSON" on Uptime Kuma) |
| [0031](adr/0031-drag-and-drop-everywhere.md) | **Drag and drop:** drop on another Bookmarks card plus Move to…; drag by the grip on a phone too; widgets in and out of groups, pages and slides as well |
| [0030](adr/0030-community-widgets-without-code.md) | **Community widgets without code:** hard-coded values become values in `.env`; optional settings under More options; values, title and cache in the widget's settings; a second copy asks for the same or its own values |

## Decided on 2026-10-15 (via chat)
| ADR | Outcome |
| --- | ------- |
| [0029](adr/0029-values-in-the-editor.md) | **Values in the editor:** asked for when adding a widget, a Values screen, an eye that shows stored values, container variables not covered; kept in `.env` |
| Community Apps repository | Claude creates `gcarstoiu/unraid-templates`; the PM submits it |

## Decided on 2026-10-14 (via chat, after v1.0.0)
| ADR | Outcome |
| --- | ------- |
| [0028](adr/0028-community-widgets.md) | **Community widgets** in Add widget: snapshot bundled per release, previews from GitHub, server-only ones listed without Add |
| [0027](adr/0027-fill-in-container-icons-and-links.md) | **Fill in icons and links** button: Unraid icons downloaded, Unraid WebUI links, names tidied |
| Releases | v1.0.0, v1.0.1, v1.1.0 notes approved and released; v1.2.0 notes approved 2026-10-15 and released |

## Decided on 2026-10-14 (via chat)
| ADR | Outcome |
| --- | ------- |
| [0026](adr/0026-dashboard-look-and-menu.md) | Lines switch; background fix plus blurred copy and top position; Edit link; any of the 14 docs themes in the menu; container icon, name, URL, description |
| [0025](adr/0025-upload-on-first-run.md) | **Upload your Glance folder as a .zip** on first run (option C): includes, assets and `.env` come with it |
| [0024](adr/0024-all-in-one-container.md) | **One container** (editor, Glance, preview, Docker gate) with one Unraid template; ports 8080/8090; follows `:latest`; template with our releases now, Community Apps later. Supersedes ADR-0023 and in part ADR-0005 |

## Decided on 2026-10-13 (via chat)
| ADR | Outcome |
| --- | ------- |
| [0001](adr/0001-language-and-framework.md) | TypeScript + **SvelteKit** (TS pinned to 6.x for SvelteKit 3) |
| [0002](adr/0002-data-store.md) / [0003](adr/0003-data-model-migrations.md) / [0007](adr/0007-versioning-and-release-notes.md) | Accepted as written |
| [0004](adr/0004-authentication.md) | **No auth, LAN only**: accepted risk, recorded in the ADR |
| [0005](adr/0005-docker-socket-access.md) | Socket proxy for the editor only. Live Glance keeps its socket |
| [0008](adr/0008-backup-and-rollback.md) / [0010](adr/0010-out-of-band-config-edits.md) | Accepted: history screen, `.prev`, drift detection |
| [0011](adr/0011-import-of-existing-config.md) | One flattened `glance.yml` |
| [0012](adr/0012-design-handoff.md) | Designs via "Handoff to Claude Code", archived in `design/handoffs/`. Mechanism to verify with a sample |
| [0009](adr/0009-glance-behaviour-baseline.md) | Accepted: explicit Save, validate before write, our Glance mounts the config folder |
| [0006](adr/0006-glance-version-pinning.md) | Pin v0.8.6 in **our** stack. The current Unraid Glance is untouched |
| Project scope | The new stack (Glance + editor) **replaces** the current Unraid Glance at cutover. The current one is never modified |
| [0013](adr/0013-license.md) | License: GPL-3.0 |
| Design pass 1 ([ADR-0016](adr/0016-design-pass-1-adopted.md)) | UX source of truth; design wins on UX differences; **proxy overrides D-25**; **D-38 keeps comments** (ADR-0015); archived with the design system's name redacted |
| Plan v2, D-56, D-61, D-62 | Plan v2 approved. Icon Web tab: Iconify + Openverse (Wikimedia fallback). Pixabay: local pool, refreshed only on request; 1280 px accepted |
| [0018](adr/0018-fields-glance-does-not-require.md) | Fields the docs call required but Glance accepts empty: **warn on Review, don't block** |
| Repo / identity | Public GitHub repo. PRs from your gh login, so branch protection has 0 required approvals |

## Findings you should know about
- Importing a config moved from another Glance failed the check whenever it set `server: assets-path` (Glance's
  Docker example sets `/app/assets`): Glance's validator refuses a folder that doesn't exist. Fixed with ADR-0025: the
  import sets it to this container's folder, and Review lists the change.
- Glance v0.8.6 **exits with code 0** on an invalid startup config (the docs say "exits with an error").
- With a **single-file bind mount**, Glance does not see atomic saves. A directory mount works. Our stack uses a directory mount; your current Glance (file mount) is unaffected because it gets replaced.
- `config:validate` / `config:print` behave well (validate exits 1 on errors; print keeps placeholders literal).
- The docker label-vs-map precedence is still **untested** (the source suggests the map wins).
- Dev Glance confirmed reachable from another LAN device (by you, 2026-10-13).
- Correction: the Phase 0 docs called the dev machine's Docker "rootless". It is rootful. Fixed in lessons and ADR-0009.

## Phase 10 findings
- Checked on the dev Glance (2026-10-14): a background image set through the dev editor showed in Preview and on the
  dev Glance. Your dev dashboard was then restored to version 2 (same content, saved as version 4); the test image
  stays in the dev assets folder.
- That check found a bug, fixed in 10b: changing only the background (Dim, say) counted as no change.
- Pixabay is built but not tried with a real key (Claude has none). Try it on the dev editor: Theme → Background →
  Add images → Pixabay.
- Glance has no background setting, so the editor writes a CSS file into Glance's assets folder and keeps the
  background settings in glance.yml under its own `glance-editor:` key, which Glance ignores (tested). They travel with
  every version, so Restore brings a background back too.
- If glance.yml has no `server: assets-path`, the editor now offers "Use Glance's assets folder" (on the Theme screen
  and in the icon finder). It sets the value in the draft, and Review lists it. This is new; the design assumed the
  folder was set.
- The tests check what the browser actually paints on the real Glance: the image, both slideshow images, and the
  Preview frame.

## Phase 9 findings
- Web and site icons need Glance's assets folder, and glance.yml must set `server: assets-path`, or Glance won't
  serve the file. The editor has no screen for that setting yet; Phase 10 (backgrounds) needs the folder too and will
  propose how it gets set.
- About 500 icons in each of selfh.st and Dashboard Icons have no SVG. The finder writes `.png` for those, as Glance
  needs; previews use exactly the address Glance uses (tested against Glance).
- Every downloaded file gets a `.license.json` next to it with the licence, creator and source.

## Phase 8 findings
- The editor never gets the Docker socket. A pinned proxy (v0.5.0, by digest) lets it list containers and refuses
  every change: tested, a POST to create, stop, kill or exec, and a DELETE, all get 403 and the container keeps running.
- Glance hides a container only for `true` or `yes` (a label `glance.hide=1` shows it), and Running only also shows
  paused containers. The section follows Glance exactly, and the real Glance in the tests agrees with it.
- Hiding a container and showing it again now leaves nothing to save (before, the editor counted the map's new order
  as a change).
- Not built: typing a container name when Docker can't be reached (ADR-0005 mentioned it; the design has no control
  for it; the YAML tab can do it). Say if you want it.
- Some short texts are mine, not the design's (listed in the phase file), for example "Docker has no container with
  this name, so Glance ignores it".

## Phase 7 findings
- Preview works inside the editor: the editor serves the preview Glance under its own address (`/preview`), using
  Glance's `base-url` setting, so framing is never blocked and the preview Glance needs no port of its own (ADR-0019,
  no decision needed).
- The preview Glance substitutes `${VAR}`s from its own environment. In the real install (Phase 11) it needs the same
  environment, assets folder and Docker access as live Glance, or widgets that use them show errors in the preview.
- Design detail followed from the written flow: pressing Preview again after an edit shows the previous build marked
  "Out of date" until you press Refresh (the prototype rebuilt at once). Details in the phase file.

## Phase 6 findings
- A widget can now be edited as YAML and is written exactly as you typed it, comments and `${VAR}`s included. Keys
  Glance doesn't know are kept and written (they come back after a save, and stay on later saves).
- The design's three columns don't fit beside the settings panel at 1280 px (the prototype squeezes the middle column
  to about 100 px). With the panel open, columns keep a usable width and the layout scrolls sideways.
- Tapping a card's grip shows its move buttons without opening the settings panel. In the prototype the panel opened
  and, on a phone, covered the buttons.
- New widgets start with only their type; Glance's defaults show greyed in the fields, so the file only gets what you set.
- Glance's own default colours (v0.8.6 source): background 240 8 9, primary 43 50 70, negative 0 70 70; positive follows primary.

## Phase 5 findings
- Try it: the dev editor at :18190 (`docs/dev-environment.md`). It edits the dev Glance's config only.
- A page named "Login" (or slug `login`/`logout`) passes Glance's validator, but Glance then refuses to load the config.
  The editor now blocks it with a clear message.
- Glance's validation errors name only the widget type. The editor works out which widget it is, so Go to can point at it.
- A file changed by hand is now recorded as soon as the editor is opened (design 03), not only at the next save.
- If glance.yml can't be written, nothing is recorded: no version appears in History (design: "Nothing changed").
- Two saves within the same second can't be told apart by Glance's reload signal ("reload not confirmed"). Rare in use.

## Phase 4 findings
- All 29 widget type names (28 widgets plus `stocks`, an old name for `markets`) now have a schema checked against the real
  Glance binary: required fields, enum values, and that every key is one Glance reads.
- Glance's docs and v0.8.6 differ in places:
  - 17 "required" fields aren't checked (ADR-0018).
  - DNS stats needs a service even though the docs give a default.
  - An iframe without a height is 50 px tall, not 300.
- Refresh (D-58), from the source: Weather and Calendar (legacy) update on the hour. The new Calendar, Clock, Search,
  Bookmarks, To-do, iframe, HTML, Group and Split column fetch nothing. The rest have a default interval that `cache` overrides.
- The 14 built-in themes (11 dark, 3 light) are extracted from Glance's docs at the pinned version, ready for the theme screen.

## Phase 3 findings
- The save pipeline is complete and tested against real Glance, including "reloaded" vs "not confirmed".
- Drafts need two references: the text to splice into, and the live text to measure changes against (found by the restore test).
- SvelteKit 3: `$lib` became `#lib`, and its built-in CSRF check misfires on body-less POSTs. Mutations now must be JSON, which is also a stronger CSRF defence (ADR-0004 note).

## Phase 2 findings
- "Keep your file" works: no-edit saves are byte-identical; random edits keep comments and pass Glance (6 fixes along the way, see lessons).
- One value pattern can't be kept exactly (an escape directly followed by two chained placeholders). It's blocked with a clear message rather than risking silent changes.
- Glance details: `config:print` adds one trailing newline; `$include` swallows the line's `- `; nested include paths are relative to the including file.

## Design verification (Glance v0.8.6, tested)
- The `containers` map beats a `glance.hide` label. Your D-23 choice (read-only "Label") stands as decided.
- There are no framing headers, so in-editor preview is possible (D-48).
- `/assets/` is cached for 2 h, so swapped images can show stale for up to 2 h (D-62).
- Reload signal found (D-29): `manifest.json?v=<time>` changes only on a successful reload.
- In v0.8.6 the new `calendar` widget is static; only `calendar-legacy` and `weather` are hourly (D-58 wording).

## Phase 1 findings
- Glance ignores unknown YAML keys silently, so the model is strict and warns about anything it keeps in `extra`.
- Glance substitutes placeholders as raw text before parsing (comments included). Edge cases are verified and covered by tests.
- The real-binary tests caught a validator bug that my own model-based tests missed. Both kinds of test are kept.

## Next steps
1. You: submit `gcarstoiu/unraid-templates` at https://ca.unraid.net/submit/new; paste any Validate/Scan findings to
   Claude.
2. You: on Unraid, Docker → Check for Updates → apply the update (v1.5.0); Theme → Dashboard look → Compact widgets,
   Save, and look at the dashboard; try a community widget's fields, More options and its settings panel, and drag a
   bookmark link to another group; report what you see.
3. You: open the Uptime Kuma widget's settings (v1.4.0 and later): the Service line says whether Uptime Kuma answered, or why
   not. The address is only `http://<server>:3001` (nothing after the port), the slug only the status page's last
   part; the container log line "Invalid response JSON in custom API widget url=…" shows the address Glance asked.
4. You: when ready, cut over from your old Glance (`docs/runbooks/cutover.md`; rehearse the fallback first).
5. Open decisions above (D-62, assets list, default themes) whenever convenient.
6. Claude, when asked: record the PM's Unraid observations in ADR-0024; move the community widgets pin to a newer
   commit (run `scripts/community-widgets.ts`, fix what it reports in `community-widgets.settings.yml`, give `origin`
   to each address field whose service can't run under a sub-path (ADR-0032), run `test/community-live.sh` on the
   image, review, PR); a newer Glance pin (ADR-0006) when one is released.
7. Offered to the PM, not asked for yet: a README how-to for the Docker proxy on another server; Docker errors in
   plain words (needs an ADR); caching Playwright's Chromium in CI (`docs/todo-claude.md`).

## Session log
- 2026-10-28: end of session. Everything merged and pushed; PR #41 (outside contributor) left for the PM. Removed
  locally: scratch logs and spikes, build output, old copies of released images and merged local branches (all are
  on GitHub). Three lessons added (Glance's fade-in, hidden columns on a phone, `:has()` rules in pairs);
  `docs/todo-claude.md` brought up to date.
- 2026-10-28: v1.5.0 released at the PM's request (compact widgets, PR #38; release PR #39): `:1.5.0` and `:latest`
  published from main; `test/all-in-one.sh` passed on the published image, and the switch and its CSS are in it. The
  Community Apps template is unchanged (it follows `:latest`).
- 2026-10-28: the PM asked for less space between stacked widgets, as much as between columns. Measured on the pinned
  Glance with a mock dashboard (54 px box to box against 23 px between columns); two options shown; ADR-0034 (B)
  accepted and built on `feat/compact-widgets`.
- 2026-10-27: v1.4.1 released at the PM's request (community widgets marked early alpha): `:1.4.1` and `:latest`
  published; `test/all-in-one.sh` passed on the published image, and both notes are in its editor. The Community Apps
  repository's template re-rendered from v1.4.1 (its PR #1, merged).
- 2026-10-27: the PM asked whether the Docker proxy differs on a Synology ("connection refused"). Answered in chat: the
  pinned proxy's port published on 127.0.0.1 only refuses other machines (tested); without IPv6 it can't open its port
  (`DISABLE_IPV6=1`). The README has no how-to for a proxy on another server yet (offered, not asked for).
- 2026-10-27: ADR-0033 (community widgets marked early alpha), asked for by the PM, built on `feat/community-alpha-note`.
- 2026-10-26: v1.4.0 released (notes approved by the PM): `:1.4.0` and `:latest` published; `test/all-in-one.sh`
  passed on the published image, and `/api/widget/try` inside it gave "answered", "invalid response JSON" and
  "connection refused" for a JSON address, a web page and a closed port.
- 2026-10-26: the PM reported "invalid response JSON" on an Uptime Kuma widget. Cause found in Glance's and Uptime
  Kuma's source and reproduced with the pinned Glance (a page address or a whole status page address in the fields);
  the PM's own values weren't looked at. ADR-0032 proposed, accepted as recommended, built on `feat/widget-check`.
- 2026-10-26: v1.3.0 released (notes approved by the PM): `:1.3.0` and `:latest` published, `test/all-in-one.sh` passed
  on the published image. Main's CI was cancelled once at the job's 15-minute limit (GitHub took 13 minutes to install
  Chromium) and passed on re-run.
- 2026-10-26: PR #27 (ADR-0030) merged by the PM; PR #28 (a teardown race in the UI tests) merged by Claude.
  ADR-0031 (drag and drop) proposed, accepted as recommended, and built on `feat/drag-and-drop`.
- 2026-10-26: community widgets checked one by one (README audit; each set up through the UI in a throwaway
  container); ADR-0030 proposed, accepted (all four as recommended) and built on `feat/community-codeless`.
- 2026-10-23: end of session. Everything pushed and merged; handoff, todos and phase file brought up to date.
- 2026-10-15: v1.2.0 notes approved by the PM (values set in the editor).
- 2026-10-15: ADR-0029 (values set in the editor) decided and built on `feat/values`.
- 2026-10-15: `gcarstoiu/unraid-templates` created and filled (v1.1.0 template, GPL-3.0); waiting for the PM's Community Apps submission.
- 2026-10-14: v1.1.0 released (community widgets). Community Apps files prepared (`scripts/render-community-apps.sh`).
- 2026-10-14: v1.0.1 released (certificates; the two Docker features missing from 1.0.0). v1.1.0 notes approved by the PM.
- 2026-10-14: ADR-0028 (community widgets) accepted and built; favicon. On branch `feat/community-widgets`, on top of the v1.0.1 PR.
- 2026-10-14: Found that PR #18 was merged before its last two commits were pushed: another server's containers and Fill in icons and links are missing from v1.0.0. They go into v1.0.1 with the certificate fix (notes for approval).
- 2026-10-14: v1.0.0 bug found by the PM: no CA certificates in the image, so HTTPS widgets failed. Fixed for v1.0.1 (notes for approval).
- 2026-10-14: **v1.0.0 released** (notes approved by the PM; tag pushed at the PM's request). `:1.0.0` and `:latest` published; the release page shows the notes; the template points at `:latest`; `test/all-in-one.sh` passed on the published image.
- 2026-10-14: PR #18 merged by the PM. v1.0.0 release notes finalised in the release PR, for the PM's approval; then the `v1.0.0` tag.
- 2026-10-14: ADR-0026 (five findings from the PM's install) proposed, accepted, built and tested on branch `phase-11/findings-2`; PR waits for the PM's go-ahead.
- 2026-10-14: PR #16 merged by Claude at the PM's request. rc.2 (upload) and rc.3 (two fixes from the PM's install: a clearer message for a quoted value wrapped onto an unindented line; the page no longer scrolls behind an open sheet) published.
- 2026-10-14: Test release v1.0.0-rc.1 published (image and template). ADR-0025 (upload a .zip on first run) proposed, accepted as option C, built.
- 2026-10-14: One container (ADR-0024) built and accepted: image/start.ts, the Docker gate, the Unraid template and icon, test releases; tested end to end on the dev machine.
- 2026-10-14: PR #14 (Phase 10b) merged by Claude, after fixing a test teardown hang CI found.
- 2026-10-14: Phase 11 prepared: ADR-0023 (proposed), runbook drafts, release workflow, Glance license in the image, v1.0.0 notes draft. PR opened; not merged (decisions pending).
- 2026-10-14: PR #13 (Phase 10a) merged by Claude. Phase 10b implemented (Pixabay; two 10a fixes); dev Glance checked and restored; PR opened. ADR-0022.
- 2026-10-14: PR #12 (Phase 9) merged by Claude. Phase 10a implemented (background image and slideshow); PR opened. ADR-0021 (non-UX).
- 2026-10-14: PR #11 (Phase 8) merged. PM allowed Claude to merge the remaining phases. Phase 9 implemented (icon finder); PR opened. ADR-0020 (non-UX).
- 2026-10-14: PR #10 (Phase 7) merged; ADR-0019 accepted. Phase 8 implemented (socket proxy, Containers section); PR opened.
- 2026-10-14: PR #9 (Phase 6) merged. Phase 7 implemented (preview Glance, proxy, preview screen); PR opened. ADR-0019 (non-UX).
- 2026-10-14: PR #8 (Phase 5) merged. Phase 6 implemented (widgets, inspector, YAML overrides, bookmarks, theme); PR opened.
- 2026-10-13: Phase 5 implemented (first screens, UI tests at two widths); PR opened. ADR-0018 accepted (option B).
- 2026-10-13: PR #7 (Phase 4) merged.
- 2026-10-13: Phase 4 implemented (widget schemas for every type, schema v2, themes); PR opened. ADR-0018 proposed.
- 2026-10-13: PR #6 (Phase 3) merged.
- 2026-10-13: Phase 3 implemented (server core, API, dev editor wired to dev Glance); PR opened.
- 2026-10-13: Phase 2 implemented (import, writer, report, CLI); PR opened.
- 2026-10-13: Plan v2, D-56, D-61 and D-62 decided by the PM (all as recommended).
- 2026-10-13: Design pass 1 received (zip). Archived; conflicts resolved with the PM; §1 verified against v0.8.6; research done (D-29, D-56, D-61/62); plan v2 proposed.
- 2026-10-13: PR #2 (license) merged. PR #3 rebased onto it.
- 2026-10-13: Phase 1 implemented; PR opened.
- 2026-10-13: PR #1 merged (as a merge commit; the squash-only repo setting isn't applied yet). License PR #2 opened.
- 2026-10-13: Phase 0 built. Then your decisions were applied, the repo was created, the PR opened, and the dev Glance deployed on the dev machine.
