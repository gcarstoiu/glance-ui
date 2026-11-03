# Glance Editor

**A no-code editor for [Glance](https://github.com/glanceapp/glance) dashboards, in one container with Glance itself.**
Build pages, columns and widgets, pick a theme, icons and a background, and see the result before it goes live. All of
this happens in the browser, without writing YAML. Glance Editor writes Glance's own `glance.yml`, so your dashboard is
always a plain Glance dashboard.

![A Glance dashboard made with the editor](docs/screenshots/readme/dashboard-desktop.png)

> **Status:** release candidate for v1.0.0. Built and tested for Unraid on amd64; it runs anywhere Docker runs.
> Pinned to Glance **v0.8.6** ([glance.version](glance.version)).

## Built on Glance
Glance is the work of the [glanceapp/glance](https://github.com/glanceapp/glance) project and its contributors: the
dashboard, its widgets, its themes and its docs. This project only adds an editor around it. All the hard work that
makes the dashboard fast, good-looking and useful is theirs. If you like Glance, star
[their repository](https://github.com/glanceapp/glance) and consider [supporting it](https://github.com/glanceapp/glance#readme).

This image includes the **unmodified** Glance binary from Glance's official image, under Glance's own licence
(AGPL-3.0). Its licence and a link to its exact source are in [third_party/glance](third_party/glance/README.md) and
inside the image at `/usr/share/doc/glance/`.

## What you get
**One container** runs:
- your Glance dashboard;
- the editor;
- a second, private Glance for previews;
- a small gate that only lets the editor *list* Docker containers.

Install it once, and it's all there.

### The editor
- **Pages and columns.** Add, rename, reorder and delete pages. Pick a layout of up to three columns, small or
  full. The editor keeps you within Glance's rules: at most three columns, one or two full, slim pages with two.
- **Every widget Glance v0.8.6 has**, each with a form built from its settings. Glance's defaults show greyed, so
  `glance.yml` only gets what you change. Anything the form doesn't cover can be written in the widget's YAML tab.
- **Drag and drop** by a grip, with a mouse or a finger: widgets between columns and into groups, pages, slides, and
  bookmark links and groups, even into another Bookmarks widget. Or tap the grip for move buttons and **Move to…**.
- **Bookmarks** with groups, colours and icons.
- **Docker containers.** Show or hide each container with one tap, and give it an icon, a name, a link and a
  description. On Unraid, the icon Unraid already uses for the container is offered too. Containers on other servers
  work as well: point a widget's Docker socket path at a read-only proxy there (`tcp://<server>:2375`).
  **Fill in icons and links** does it for all of them at once: Unraid's icons (downloaded) and web UI addresses,
  library icons by image name, and tidy names.
- **Community widgets (early alpha).** Add any of the widgets Glance users share in
  [glanceapp/community-widgets](https://github.com/glanceapp/community-widgets) from Add widget → Community: search,
  preview, pick a variant, fill in labelled fields for what it needs (an address, a key, a user name, a location;
  options under More options), add. Its title, cache and values stay editable in its settings, which also say whether
  its service answers, and why not in plain words. **This part is in early alpha:** not every community widget works
  out of the box without code; some need a change in their YAML, or in their service's settings. Each one is checked
  with the pinned Glance for every release, and set up through the editor in a test container.
- **Values** for `${VARIABLES}` (addresses, keys, passwords) are set in the editor and kept in `.env` next to glance.yml,
  out of glance.yml and History.
- **Icon finder** for bookmarks, monitors and containers. It searches Simple Icons, selfh.st Icons, Dashboard Icons
  and Material Design Icons, the site's own icon, and openly licensed images on the web. Web images are downloaded
  into Glance's assets folder, with their licence.
- **Theme.** Start from any of the 14 themes in Glance's docs, then adjust each colour. Choose which of those themes
  the dashboard's own theme picker offers.
- **Background.** One image or a slideshow, from your device, a folder on the server, or Pixabay (with your key).
  Settings: fit, dim, blur, see-through widgets, and for a whole image a blurred fill or top alignment.
- **Dashboard menu and look.** An optional **Edit** link in the dashboard's menu opens the editor on the page you're
  looking at. Optionally hide the thin lines between list items, or make widgets compact: each title inside its box,
  and widgets in a column as far apart as the columns.
- **Preview** the draft on the private Glance, at desktop or phone width, before anything goes live.
- **Explicit Save with checks.** Review shows every change. Then the draft is checked by the editor's rules and by
  Glance's own validator, and `glance.yml` is written only if both pass. Glance reloads, and the editor confirms it.
- **History.** Every save is a version, and you can restore any of them. A file changed by hand is noticed and kept as
  its own version.
- **Your file stays yours.** Importing keeps your comments, order and formatting wherever you didn't change anything.
  `${VARIABLES}` and `${secret:…}` placeholders are kept exactly as written and never resolved.
- **Bring your current Glance.** Upload a `.zip` of your Glance folder on the first screen. The editor checks the
  config with its include files, and carries over your assets (icons, custom CSS) and your `.env`.

## Screenshots
| | |
| --- | --- |
| ![The page editor](docs/screenshots/readme/editor-page-desktop.png) Pages, columns and widgets | ![A widget's settings](docs/screenshots/readme/editor-widget-desktop.png) A widget's settings |
| ![The theme screen](docs/screenshots/readme/editor-theme-desktop.png) Theme | ![Preview](docs/screenshots/readme/editor-preview-desktop.png) Preview before going live |
| ![Docker containers](docs/screenshots/readme/editor-containers-desktop.png) Docker containers | ![Uploading a Glance folder](docs/screenshots/phase-11/upload-check-desktop.png) Uploading your Glance folder |

On a phone:

<p>
<img src="docs/screenshots/readme/editor-page-phone.png" width="200" alt="The page editor on a phone">
<img src="docs/screenshots/readme/editor-review-phone.png" width="200" alt="Review before saving, on a phone">
<img src="docs/screenshots/readme/dashboard-phone.png" width="200" alt="The dashboard on a phone">
<img src="docs/screenshots/phase-11/glance-edit-link-phone.png" width="200" alt="The Edit link in the dashboard's phone menu">
</p>

## Install
### On Unraid
1. Open the Unraid terminal and fetch the template (once):
   ```sh
   curl -fsSL -o /boot/config/plugins/dockerMan/templates-user/my-glance-editor.xml \
     https://github.com/gcarstoiu/glance-ui/releases/latest/download/glance-editor.xml
   ```
   The template is also attached to every [release](https://github.com/gcarstoiu/glance-ui/releases). For a test
   release, use its own address: `https://github.com/gcarstoiu/glance-ui/releases/download/v<VERSION>/glance-editor.xml`.
2. **Docker** tab → **Add Container** → Template: **glance-editor**.
   - **Editor** port: `8090` (the WebUI).
   - **Dashboard** port: `8080`. Pick another if something already uses it, such as a Glance you already run.
   - **Data**: leave `/mnt/user/appdata/glance-editor`.
   - **Docker socket**: keep it if you want a Docker containers widget.
   - **Photos** (optional): a share with photos to use as backgrounds.
3. **Apply**, then click the container's icon → **WebUI**.

Updates show up in the Docker tab like any other container ("update ready").

### With Docker
```sh
docker run -d --name glance-editor \
  -p 8090:3000 -p 8080:8080 \
  -v /path/to/glance-editor:/data \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e PUID=1000 -e PGID=1000 \
  --restart unless-stopped \
  ghcr.io/gcarstoiu/glance-editor:latest
```
Open `http://<server>:8090/` for the editor; the dashboard is on `http://<server>:8080/`.

| Setting | What it is |
| ------- | ---------- |
| Port `3000` | The editor |
| Port `8080` | Your Glance dashboard |
| `/data` | Everything: `config/glance.yml`, `assets/` (icons, backgrounds), `editor/` (versions and settings). Back up this one folder |
| `/var/run/docker.sock` (read only, optional) | For the Docker containers widget, and so the editor can list containers. The editor itself never gets the socket: it asks a gate that only lets it list |
| `/photos` (read only, optional) | A folder of photos for backgrounds |
| `PUID`, `PGID` | The user and group the editor runs as and writes files as (Unraid: `99` and `100`) |
| `HOST` (optional) | The address the editor listens on: `0.0.0.0`, IPv4 only, unless set. Set `::` when the container's network has IPv6, or browsers that connect over IPv6 get an empty reply |
| Your own variables | Anything your `${VARIABLES}` need. They go to Glance, not to the editor. A `.env` next to `glance.yml` works too |

### First run
The editor opens on **Set up the editor**:
- **Upload your Glance folder:** a `.zip` of the folder that holds your `glance.yml`. Include files, `assets/` and
  `.env` come with it. On macOS, right-click → Compress; on Windows, Send to → Compressed folder.
- **Import glance.yml:** if you copied it into the data folder's `config/` yourself.
- **Start empty:** one page with a layout you pick.

Nothing is written to `glance.yml` until you press **Save**.

Moving from a Glance you already run? Install this beside it on another dashboard port, compare the two, then switch
over. The runbooks walk through it: [install](docs/runbooks/install.md), [compare](docs/runbooks/compare.md),
[cut over and fall back](docs/runbooks/cutover.md), [update](docs/runbooks/update.md).

## Good to know
- **No login.** The editor is meant for your home network only; don't expose it to the internet. Your dashboard can
  keep Glance's own login (`auth`).
- **Glance's version is pinned** and moves only with an editor release, after the editor has been tested against it.
- **The editor owns `glance.yml`.** Editing it by hand still works: the editor notices, keeps your change as a
  version, and asks before saving over it.
- **What the editor adds to `glance.yml`:**
  - a `glance-editor:` section for the background and look settings (Glance ignores it);
  - its CSS file as `theme: custom-css-file` (your own CSS file is imported by it);
  - its small scripts in `document: head:`.
  Switch the features off and these go again.
- **Outbound internet** is used for icon lists, web icon search and Pixabay, only when you use them.

## Development
- [docs/handoff.md](docs/handoff.md): where the project stands.
- [docs/adr/](docs/adr/README.md): every decision, with its reasons.
- [docs/testing.md](docs/testing.md): `scripts/test.sh` runs the type checks, the licence check, unit tests (many
  against the real Glance binary), browser tests at desktop and phone width with accessibility checks, and the
  container tests.
- [docs/api.md](docs/api.md): the editor's HTTP API.
- [CHANGELOG.md](CHANGELOG.md): release notes.

Stack: TypeScript, SvelteKit, SQLite, Node 24, Playwright and Vitest. Issues and ideas are welcome:
[open an issue](https://github.com/gcarstoiu/glance-ui/issues).

## Credits
- **[Glance](https://github.com/glanceapp/glance)** (AGPL-3.0): the dashboard this whole project is built around.
  Its themes come from Glance's docs.
- Community widgets: [glanceapp/community-widgets](https://github.com/glanceapp/community-widgets) (CC0-1.0), each by
  the author named on its card; bundled as of the commit in [community-widgets.version](community-widgets.version).
- Icons: [Simple Icons](https://simpleicons.org), [selfh.st Icons](https://selfh.st/icons/),
  [Dashboard Icons](https://github.com/homarr-labs/dashboard-icons) and
  [Material Design Icons](https://pictogrammers.com/library/mdi/), loaded from [jsDelivr](https://www.jsdelivr.com)
  as Glance does.
- Web search: [Iconify](https://iconify.design), [Openverse](https://openverse.org) and
  [Wikimedia Commons](https://commons.wikimedia.org). Background images: [Pixabay](https://pixabay.com) (with your
  own key).
- Each icon library and image keeps its own licence; downloaded images are saved with theirs.

## License
GPL-3.0, see [LICENSE](LICENSE). Glance, included unmodified, is AGPL-3.0 ([ADR-0013](docs/adr/0013-license.md)).
