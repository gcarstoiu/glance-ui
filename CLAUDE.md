# Glance Editor: instructions for Claude

A no-code web editor that owns the entire Glance (glanceapp/glance) config. Dashboards live in the editor's own
data model; `glance.yml` is generated on every explicit Save and is output only. Existing config is imported once.

@docs/handoff.md
@docs/phases/phase-11-deployment.md

## Roles
- **PM/QA (repo owner):** merges every PR, approves every release note, decides everything with UX impact.
- **Claude Design:** UX and visual design, archived in `design/handoffs/` (ADR-0012). Design pass 1 is the UX source of truth
  (ADR-0016); its decision IDs (D-01…D-63) are cited in code, tests and PRs. Read `docs/design/reconciliation.md` first.
- **Claude (you):** implementation and all project documentation.

## Hard rules
1. **Never push to `main`.** Work on a branch and open a PR. **Merging:** the PM allowed Claude (2026-10-14, via chat)
   to merge the remaining phases' PRs itself once CI is green, unless something in them is critical for the PM to
   decide or agree to. Then stop and ask. Anything that touches the live host, cutover, or release notes stays with the PM.
2. **Never change repo settings** (branch protection, secrets, Actions permissions). Write the request into `docs/todo-user.md`.
3. **UX-impacting decisions:** write an ADR with status `proposed`, add it to "Needs user decision" in
   `docs/handoff.md`, and do not build on it until the PM accepts it. When unsure whether something is UX-impacting, treat it as if it is.
4. **No Glance or library behaviour from memory.** Check the docs/source for the *pinned* version (`/glance.version`),
   and cite the version plus the date read. Say whether a claim is from docs, source or a test.
5. **Never touch the live Glance** or its config. Use only the test harness (`docs/testing.md`) and the dev environment (`docs/dev-environment.md`). Phases before 7 never write to the live host.
6. The repo is **public**: no identifying info in files, commits, PRs or issues. That means no names, usernames, emails,
   hostnames, IPs, paths under a home directory, session/chat links, real config or tokens. Commit trailers: `Co-Authored-By` only.
   Exception (PM, 2026-10-14): the repository owner's GitHub username in the README's install addresses and links.
7. **Placeholders** (`${VAR}`, `${secret:…}`, `${readFileFromEnv:…}`, `\${…}`) are stored and written literally. Never resolve them.
8. **Explicit Save only.** Never write `glance.yml` on every edit.
9. Status reports have three separate parts: **Tested** (with scope), **Concluded**, **Not checked**.
10. Lessons and decisions go in repo files (`docs/lessons.md`, `docs/adr/`). Auto memory is machine-local and is not a record.

## Workflow per task
1. Read `docs/handoff.md` and the current phase file (both imported above).
2. Branch: `phase-N/short-topic`. Conventional Commit messages (ADR-0007).
3. Run `scripts/test.sh` locally (typecheck, licenses, vitest incl. real-binary tests, UI end to end, shell harness). For anything that changes
   generated config, also run `scripts/generate-sample-config.sh /tmp/g.yml && test/glance-smoke.sh /tmp/g.yml`.
4. Open a PR using the template. "UX changes" is required: screenshots, or "none".
5. Update `docs/handoff.md` (state, decisions needed, next steps) and `docs/lessons.md` if something surprised you.

## Where things are
| Path | What |
| ---- | ---- |
| `docs/handoff.md` | Current state, decisions waiting for the PM, next steps |
| `docs/phases/plan.md` | Phase plan (approved 2026-10-13) |
| `docs/phases/phase-*.md` | Per-phase scope and acceptance criteria |
| `docs/adr/` | Decisions. See its README for the status rules and index |
| `docs/lessons.md` | Lessons learned. Read before touching Glance integration |
| `docs/design/reconciliation.md` | Design vs ADRs, PM resolutions, design assumptions verified against Glance v0.8.6 |
| `docs/testing.md` | Test harness, safety rules, commands |
| `docs/dev-environment.md` | The LAN dev Glance and editor on the dev machine (`dev/up.sh`) |
| `design/handoffs/` | Archived Claude Design handoffs (ADR-0012) |
| `docs/todo-user.md` / `docs/todo-claude.md` | Open actions for the PM / for Claude |
| `glance.version` | The pinned Glance image (tag plus digest). The single source for CI and tests |
| `packages/model` / `generator` / `glance` | Data model + rules (zod) / model → YAML / pinned-binary validation and `config:print` (ADR-0014) |
| `packages/model/src/widgets.ts` | Widget schemas for every Glance type: fields, labels, defaults, refresh. Drives model, import, output, forms (ADR-0017) |
| `scripts/glance-source-data.ts` | Extracts widget type names and built-in themes from Glance's source at the pinned commit |
| `packages/document` | Import (`importFile`), document-preserving writer (`writeDraft`), report, CLI (ADR-0015) |
| `packages/server` | `Editor`: drafts, versions, save pipeline, SQLite store (Phase 3) |
| `docs/api.md` | The editor's HTTP API |
| `packages/editing` | Page/column and widget operations, layout rules (D-07–D-10), form parsing, colours and palettes, wording, line diff: UI logic without a DOM, tested in Node |
| `apps/editor` | SvelteKit 3 app: `src/lib/client` (state, API), `src/lib/components`, `src/lib/styles/app.css` (design tokens + prototype CSS). `Dockerfile` builds it with the glance binary |
| `image/` | The all-in-one container's start program and Docker gate (ADR-0024). `unraid/`: the Unraid template and icon |
| `test/e2e` | Playwright UI tests: built app + real Glance per test, desktop and 390 px, axe and 44 px checks (`npx playwright test`) |
| `docs/screenshots/` | Screenshots per phase, captured by the UI tests |
| `test/` | Harness scripts and fixtures (`test/fixtures/model/v2/` = model fixtures) |
| `.github/` | CI, PR template, issue forms |

## Key Glance facts (v0.8.8, re-checked 2026-11-13; details and evidence in ADR-0009 and ADR-0036)
- Hot reload works for the main and included files. An invalid config at runtime is logged, and the old config is kept.
- An invalid config at **startup**: Glance exits with **code 0**. Don't trust the exit code.
- Atomic writes need the config **directory** to be bind-mounted, not the single file.
- Use `glance config:validate` (exit 1 on error) before writing. `config:print` inlines includes and keeps placeholders literal.
- Layout: ≤3 columns, 1–2 `full`; `slim` ≤2 columns; no group/split-column inside a group.
- docker-containers `containers` map beats `glance.hide` labels. No framing headers. `/assets/` is cached 2 h. Reload signal:
  `manifest.json?v=<time>` in every page changes only on a successful reload (all tested).
- Glance ignores unknown keys silently, and substitutes placeholders as text over the whole file, comments included (ADR-0014).
  Never hand-roll YAML for placeholders: use the generator. Edits to an imported file are spliced, not regenerated (ADR-0015).
- `config:validate` doesn't run `newApplication`: a page slug `login`/`logout` passes validate but Glance won't load it
  (rule `page.reserved-slug`). Glance's reload stamp has 1 s resolution.
- docker-containers: the map's entry replaces a container's `glance.*` labels; `hide` hides only for `true`/`yes`.
  Docker's `all=false` (Running only) includes paused containers. The editor lists containers only through the
  read-only socket proxy (`/docker-proxy.version`, ADR-0005), never the socket.
- Icons: `si:`/`mdi:` load from jsDelivr `@latest`, `sh:` from `selfhst/icons@main`, `di:` from dashboard-icons'
  default branch; `sh:`/`di:` take `.png`/`.webp` (no svg for ~500 icons each). `/assets/…` icons get no base-url.
  `server.assets-path` must exist or Glance won't start (ADR-0020).
- Background (ADR-0021): Glance links `theme.custom-css-file` with `?v=<load time>` and inserts `document.head` as is;
  it ignores the editor's own top-level `glance-editor:` key. `/assets/` is cached 2 h: name files by content.
- `server.base-url` prefixes every link and script path Glance writes, but not its routes: a proxy that strips the
  prefix serves it under a path (the preview at `/preview`, ADR-0019). An unset env var in a placeholder fails the load.
- Glance's theme defaults (main.css, unchanged v0.8.6 to v0.8.8): background 240 8 9, primary 43 50 70, positive = primary, negative 0 70 70.
- Glance's docs overstate "required" for 17 widget fields and differ from v0.8.6 on some defaults (lessons, ADR-0018).
  The binary is the reference: `packages/document/test/widget-schema.test.ts`.
- New in v0.8.8 (ADR-0036): Reddit `search` needs `app-auth`; a title link or a container's link whose scheme isn't
  http, https or mailto becomes `#ZgotmplZ`; a child container (`glance.parent`) isn't filtered by the category.
