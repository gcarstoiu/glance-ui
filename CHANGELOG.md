# Changelog

All notable changes are recorded here. The format follows Keep a Changelog; versions follow SemVer
(process: docs/adr/0007-versioning-and-release-notes.md, accepted).

## [Unreleased]

## [2.0.0] - 2026-11-13
### Changed
- **The dashboard runs Glance v0.8.8** (was v0.8.6), with Glance's fixes and security fixes since then.
- **A Reddit widget's Search needs App authentication**, since Reddit changed its API. Glance v0.8.8 refuses the
  dashboard otherwise: after the update, a dashboard with such a widget doesn't load until Search is cleared or App
  authentication filled in. The editor still opens and shows which widget it is.

### Added
- **A warning on Review for links Glance won't keep.** Glance v0.8.8 turns a widget's title link or a container's
  link into a dead link unless it starts with http://, https:// or mailto:, or is a path on the server.
- **Brave** can be chosen as the Search widget's engine by name.

### Fixed
- **Containers that belong to another one** (`glance.parent`) show in the Containers section as Glance shows them:
  under their parent, also when the widget lists only one category.

## [1.5.1] - 2026-11-03
### Fixed
- **The editor answers over IPv6** when the container's network has IPv6, as the dashboard does. Before, browsers
  that connected over IPv6 got an empty reply.
- **A `PORT` variable**, in the container or in `.env`, now reaches the dashboard and no longer moves the editor.

## [1.5.0] - 2026-10-28
### Added
- **Compact widgets.** A new switch on the Theme screen puts each widget's title inside its box, so widgets in a
  column are as far apart as the columns. Off by default. Widgets without a box (search, videos, cards, groups) keep
  their titles above.

## [1.4.1] - 2026-10-27
### Changed
- **Community widgets are marked early alpha.** Add widget → Community and a community widget's settings say so, and
  so does the Unraid template's overview: not every community widget works out of the box without code; some need a
  change in their YAML, or in their service's settings.

## [1.4.0] - 2026-10-26
### Added
- **A community widget's settings say whether its service answers.** The editor asks the service the way Glance does,
  when the settings open and after a value is stored, and says what went wrong in plain words: an address that leads
  to a web page instead of data, a refused key, a port nothing listens on. Glance's own message is shown below it.

### Changed
- **Addresses pasted from the browser are cut back** where a widget needs only the server: Uptime Kuma's
  `http://192.0.2.10:3001/dashboard` becomes `http://192.0.2.10:3001`, and its status page's whole address gives just
  the slug. The field says what was removed.
- A value a community widget needs can no longer be stored empty.

### Fixed
- An Uptime Kuma widget showed "invalid response JSON" when its address had a page after the port, or its slug was the
  status page's whole address or empty. The help now says what to type, and such values are tidied or refused.

## [1.3.0] - 2026-10-26
### Added
- **Every community widget can be set up with fields.** Each value a community widget needs has a labelled field with
  a line of help: an address, a key, a user name, a location, an ID. Values the widgets' instructions said to change
  in the YAML are fields too, and optional settings (how many items, units, what to show) sit under **More options**
  with their defaults. The YAML is under **Show YAML**.
- **A community widget's settings** show its title, cache and values, all changeable without YAML.
- **A second copy of a widget** can share the first copy's values or have its own, to show another server.
- **Drag and drop for more things.** Bookmark links move between groups and onto another Bookmarks widget, and whole
  groups too. Widgets go into and out of groups and split columns. Pages in the side bar and slideshow images drag into
  order. On a phone, a finger on a grip drags as well. A tap on a grip offers **Move to…**, a list of every place the
  link, group or widget can go, other pages included. Moves to another widget or page can be undone.

### Changed
- **Values are checked before they're stored, and Save checks with them.** A value that would stop the dashboard
  (a quote or `: ` in a password, a port that isn't a number) is refused, with Glance's reason. A value the dashboard
  uses can't be removed. Addresses are tidied as they're typed: `http://` added when missing, no slash at the end.

### Fixed
- 11 community widgets were shown as "Needs its own server" although they can be added: their instructions' code
  wasn't marked as YAML, or was in a file of its own. More can be added now that mistakes in their instructions' YAML
  are repaired.
- The Komodo widget's Stacks variant sent the Komodo API key and secret to its author's server. It now uses the
  Komodo address entered for it.
- Widgets that can't be set up with fields are listed with the reason and can't be added: they need a sign-in done by
  hand (Spotify, Google Calendar, Beszel Metrics), a helper program (Docker Swarm), or their template is broken
  (Countdown).

## [1.2.0] - 2026-10-15
### Added
- **Fill in the values a widget needs, right where you add it.** A community widget's address, key or password is
  asked for when you add it, and kept in `.env` next to glance.yml (not in glance.yml). A new **Values** screen lists
  every value your dashboard uses, with set, replace, remove and an eye for hidden ones; Review's "no value" warning
  links to it.

## [1.1.0] - 2026-10-14
### Added
- **Community widgets.** Add widget has a Community tab: the widgets Glance users share in glanceapp/community-widgets,
  with search, previews, variants and the values each needs. Each one is checked with Glance for the release.
- Review warns about any `${VARIABLE}` that has no value in the container or `.env`.
- The editor's browser tab shows the project's icon.

## [1.0.1] - 2026-10-14
### Fixed
- **Widgets that fetch from the web work again.** Weather, RSS, releases and every other widget that loads data over
  HTTPS failed with "x509: certificate signed by unknown authority": the image had no certificates for Glance to check
  sites against. It now has the same ones as Glance's own image. Update the container (Docker tab → update) to get it.
- **Two Docker features the 1.0.0 notes describe are now really in the release.** Showing another server's containers,
  and **Fill in icons and links**, were left out of the 1.0.0 image by mistake (they were tested in release candidates
  5 and 6, but didn't make it into the release).
- When checking a config before saving, a `${VARIABLE}` used as a URL's port (`http://${HOST}:${PORT}/`) no longer makes
  the check fail.

## [1.0.0] - 2026-10-14
The first release: a no-code editor for your [Glance](https://github.com/glanceapp/glance) dashboard, in one container
with Glance itself.

### Added
- **One container to install.** Your Glance dashboard, the editor, a private preview Glance and everything they need,
  with an Unraid template (icon, description, two ports, one folder). Updates show in Unraid's Docker tab.
- **Start the way you like.** Upload a .zip of your current Glance folder (its include files, assets and `.env` come
  with it), import a glance.yml from the data folder, or start empty. Everything is checked before anything is written.
- **Pages, columns and widgets** in the browser, on desktop or phone. Every widget type in Glance v0.8.6 has a form
  built from its settings, with Glance's defaults shown greyed, and a YAML tab for anything the form doesn't cover.
  Drag to reorder, or use the move buttons.
- **Your file stays yours.** Comments, order and formatting are kept wherever you didn't change anything, and
  `${VARIABLES}` and secrets are kept exactly as written.
- **Explicit Save with checks.** Review shows every change; the draft is checked with the editor's rules and Glance's
  own validator; glance.yml is written only if both pass, and the editor confirms Glance reloaded. Problems come with a
  Go to that opens the right field.
- **History.** Every save is a version you can restore. A file changed by hand is noticed and kept as its own version.
- **Preview** the draft on the private Glance, at desktop or phone width, before it goes live.
- **Theme.** Start from any of the 14 themes in Glance's docs, adjust each colour, keep your own colours, and choose
  which themes the dashboard's theme picker offers.
- **Backgrounds.** An image or a slideshow from this device, a folder on the server or Pixabay (with your key), with
  dim, blur, see-through widgets, and for a whole image a blurred fill or top alignment. Backgrounds stay put on phones.
- **Dashboard look and menu.** Switch off the lines between list items, and add an Edit link to the dashboard's menu
  that opens the editor on the page you're on.
- **Icon finder** for bookmarks, monitors and containers: Simple Icons, selfh.st Icons, Dashboard Icons, Material
  Design Icons, the site's own icon, and openly licensed images on the web, downloaded with their licence.
- **Docker containers.** Show or hide each container with one tap, and give it an icon, a name, a link and a
  description. **Fill in icons and links** takes them from the containers themselves (Unraid's icons and web UI
  addresses) and tidies names. A widget can show another server's containers through a read-only proxy there. The
  editor only ever lists containers; it never changes them.

### Notes
- Pinned to Glance v0.8.6, which is included unmodified (AGPL-3.0).
- The editor has no login and is meant for your home network only (ADR-0004).
- Built and tested for amd64.
- **Coming from a release candidate:** in Unraid, Docker → glance-editor → Edit, set Repository to
  `ghcr.io/gcarstoiu/glance-editor:latest` and Apply. Your data folder is kept, and later releases show up as updates.