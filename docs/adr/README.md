# Architecture Decision Records

One file per decision: `NNNN-short-title.md`, copied from [0000-template.md](0000-template.md).

## Status values
- **proposed**: written by Claude, waiting for the PM. Nothing may be built on it.
- **accepted**: approved by the PM. Record who and when in the ADR.
- **rejected**: not approved. Keep the file, and record why.
- **superseded by NNNN**: replaced by a later ADR.

## Rules
- Any decision that affects user experience gets an ADR with status `proposed`, and it is listed under
  "Needs user decision" in [../handoff.md](../handoff.md). No work builds on it until it is accepted.
- Claims about Glance or a library cite the version and the date the source was read. Write "not verified"
  where that is true.
- Only the PM changes the status from `proposed`. Exception: a **non-UX** ADR may be implemented in the PR that
  introduces it; merging that PR accepts it (the PM sees it in review). UX-impacting ADRs always wait for explicit approval.

## Index
| ADR | Title | Status | UX impact |
| --- | ----- | ------ | --------- |
| [0001](0001-language-and-framework.md) | Language and framework | accepted (SvelteKit) | indirect (design handoff format) |
| [0002](0002-data-store.md) | Data store | accepted | no |
| [0003](0003-data-model-migrations.md) | Data-model migration approach | accepted | no |
| [0004](0004-authentication.md) | Authentication | accepted (none, LAN only) | **yes** |
| [0005](0005-docker-socket-access.md) | Docker socket access | accepted (proxy, editor only); in part superseded (0024) | **yes** |
| [0006](0006-glance-version-pinning.md) | Glance version pinning and upgrade policy | accepted (our stack only) | **yes** |
| [0007](0007-versioning-and-release-notes.md) | Versioning and release-notes process | accepted | no |
| [0008](0008-backup-and-rollback.md) | Backup and rollback | accepted; superseded in part (0016) | **yes** |
| [0009](0009-glance-behaviour-baseline.md) | Glance v0.8.6 behaviour baseline (verified facts) | accepted; re-run on v0.8.8 (0036) | **yes** |
| [0010](0010-out-of-band-config-edits.md) | Handling hand edits to the generated glance.yml | superseded (0016) | **yes** |
| [0011](0011-import-of-existing-config.md) | One-time import of the existing glance.yml | accepted (flatten); item 4 superseded (0015) | **yes** |
| [0012](0012-design-handoff.md) | Design handoff from Claude Design | accepted (first delivery by zip) | **yes** |
| [0013](0013-license.md) | License: GPL-3.0 | accepted | no |
| [0014](0014-data-model-and-generator.md) | Data model (schema v1) and YAML generator | accepted; superseded in part (0015, 0017) | no |
| [0015](0015-document-preserving-writer.md) | Document-preserving YAML writer (design D-38) | accepted | no |
| [0016](0016-design-pass-1-adopted.md) | Design pass 1 is the UX source of truth | accepted | **yes** |
| [0017](0017-widget-schema-registry.md) | Widget schemas drive the model (schema v2) | accepted on merge | no |
| [0018](0018-fields-glance-does-not-require.md) | Fields the docs call required but Glance accepts empty | accepted (warn, don't block) | **yes** |
| [0019](0019-preview-glance.md) | The preview Glance: a second container, served by the editor under /preview | accepted (PR #10) | no |
| [0020](0020-icon-finder.md) | The icon finder: name lists, web sources, downloads into Glance's assets folder | accepted (PR #12) | no |
| [0021](0021-background-files.md) | Background: the editor's own section in glance.yml, and its CSS file in Glance's assets folder | accepted (PR #13) | no |
| [0022](0022-pixabay.md) | Pixabay: key on the server, cached search, downloaded picks, a local rotating set | accepted (PR #14) | no (one D-62 reading to confirm) |
| [0023](0023-deployment.md) | Deployment on Unraid | superseded (0024) | **yes** |
| [0024](0024-all-in-one-container.md) | One container: the editor, your Glance, the preview Glance and the Docker gate | accepted (PM, 2026-10-14) | **yes** |
| [0025](0025-upload-on-first-run.md) | Upload your Glance folder as a .zip on the first-run screen | accepted (PM, 2026-10-14: option C) | **yes** |
| [0026](0026-dashboard-look-and-menu.md) | Five findings from the first install: lines, background jumps, an Edit link, theme choices, container icons | accepted (PM, 2026-10-14) | **yes** |
| [0027](0027-fill-in-container-icons-and-links.md) | Fill in container icons and links from what the containers carry | accepted (PM, 2026-10-14) | **yes** |
| [0028](0028-community-widgets.md) | Community widgets, ready to pick | accepted (PM, 2026-10-14); in part superseded (0030) | **yes** |
| [0029](0029-values-in-the-editor.md) | Values for ${VARIABLES}, set in the editor | accepted (PM, 2026-10-15) | **yes** |
| [0030](0030-community-widgets-without-code.md) | Every community widget set up with fields, without YAML | accepted (PM, 2026-10-26) | **yes** |
| [0031](0031-drag-and-drop-everywhere.md) | Drag and drop for bookmarks, and simpler moving everywhere | accepted (PM, 2026-10-26) | **yes** |
| [0032](0032-try-a-widget-against-its-service.md) | Try a widget against its service, and tidy pasted page addresses | accepted (PM, 2026-10-26) | **yes** |
| [0033](0033-community-widgets-early-alpha.md) | Community widgets marked early alpha | accepted (PM, 2026-10-27) | **yes** |
| [0034](0034-compact-widgets.md) | Compact widgets: titles inside their boxes | accepted (PM, 2026-10-28) | **yes** |
| [0035](0035-editor-listens-on-ipv4-and-ipv6.md) | The editor listens on IPv4 and IPv6 by itself | accepted (PM, 2026-11-03) | **yes** |
| [0036](0036-glance-v0.8.8.md) | Glance v0.8.8 | accepted (PM, 2026-11-13) | **yes** |
