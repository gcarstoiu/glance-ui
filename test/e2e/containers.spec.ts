// Plan v2 Phase 8: flow "Hide a container" (design 02) and design 03 "Docker socket unreachable", at desktop width and
// at 390 px. The editor lists containers from a stand-in for the read-only socket proxy (fixtures.ts); the real Glance
// reads the same list through the widget's sock-path, so what it shows after Save is checked too. The proxy itself
// (a POST through it is refused) is tested in test/docker-proxy.sh.
import type { Page } from "@playwright/test";
import { expect, expectAccessible, expectTargets, fixture, isPhone, test, type FakeContainer } from "./fixtures.ts";
import { shot } from "./shots.ts";

const CONTAINERS: FakeContainer[] = [
  { name: "jellyfin" }, { name: "immich-server" }, { name: "paperless" }, { name: "uptime-kuma" }, { name: "glance" },
  { name: "glance-editor" }, { name: "watchtower", labels: { "glance.hide": "true" } }, { name: "old-nextcloud", state: "exited" },
];

async function importSeed(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("button", { name: /Import glance\.yml/ }).click();
  await page.getByRole("button", { name: /^Import \d+ pages?$/ }).click();
  await expect(page.getByLabel("Page name")).toBeVisible();
}
const inspector = (page: Page) => page.getByRole("complementary", { name: "Widget settings" });
const eye = (page: Page, name: string) => inspector(page).getByRole("button", { name: `Show ${name}`, exact: true });
const row = (page: Page, name: string) => inspector(page).locator(".crow", { has: page.getByText(name, { exact: true }) });
async function openWidget(page: Page) {
  await page.locator(".wcard").getByRole("button", { name: /^Docker containers, / }).click();
  await expect(inspector(page).getByRole("heading", { name: "Docker containers" })).toBeVisible();
}

test.describe("Flow: hide a container", () => {
  test.use({ opts: { seed: fixture("docker.yml"), glance: true, docker: CONTAINERS } });

  test("eye toggles write the containers map; label-hidden is read-only; Hide by default flips; Glance agrees", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await expect(page.locator(".wcard").getByText("All shown unless hidden")).toBeVisible(); // the card's summary

    // 1. Open the Docker containers card: the section lists what the socket reports.
    await openWidget(page);
    const ins = inspector(page);
    await expect(ins.getByText("6 of 8 containers shown.", { exact: false })).toBeVisible();
    await expect(eye(page, "glance-editor")).toHaveAttribute("aria-pressed", "false"); // hidden by the imported map
    await expect(row(page, "old-nextcloud").getByText("Stopped", { exact: true })).toBeVisible();

    // 2. Press the eye on paperless → hidden; the summary count drops.
    await expect(eye(page, "paperless")).toHaveAttribute("aria-pressed", "true");
    await eye(page, "paperless").click();
    await expect(eye(page, "paperless")).toHaveAttribute("aria-pressed", "false");
    await expect(row(page, "paperless").getByText("Running · hidden")).toBeVisible();
    await expect(ins.getByText("5 of 8 containers shown.", { exact: false })).toBeVisible();

    // 3. watchtower shows "Label": hidden by a glance.hide label, and can't be changed here (D-23).
    await expect(row(page, "watchtower").getByText("Label", { exact: true })).toBeVisible();
    await expect(row(page, "watchtower").getByRole("button", { name: "Show watchtower" })).toHaveCount(0); // no eye; its settings still open (ADR-0026)
    await expect(row(page, "watchtower").getByText(/Hidden by the glance\.hide label/)).toBeVisible();
    await row(page, "watchtower").scrollIntoViewIfNeeded();
    await expectAccessible(page, "containers section");
    await expectTargets(page, "containers section");
    await shot(page, "containers", { fullPage: false }); // the settings panel scrolls on its own

    // 4. Switch Hide by default on: the list flips to show-only-what-you-pick (D-24); the eye now writes hide: false.
    await ins.getByRole("button", { name: "Hide by default" }).click();
    await expect(ins.getByText("0 of 8 containers shown.", { exact: false })).toBeVisible();
    await expect(eye(page, "jellyfin")).toHaveAttribute("aria-pressed", "false");
    await eye(page, "jellyfin").click();
    await expect(ins.getByText("1 of 8 containers shown.", { exact: false })).toBeVisible();
    await ins.getByText("1 of 8 containers shown.", { exact: false }).scrollIntoViewIfNeeded();
    await shot(page, "containers-hide-by-default", { fullPage: false });
    if (isPhone(page)) await ins.getByRole("button", { name: "Back to layout" }).click();
    await expect(page.locator(".wcard").getByText("Hidden unless switched on")).toBeVisible();

    // Save: the map is written in place (the comment and the display name stay); nothing but GETs reached Docker.
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog", { name: "Review and save" }).getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    const live = editor.live();
    expect(live).toContain("hide-by-default: true");
    expect(live).toContain("glance-editor: # the editor itself\n                hide: true");
    expect(live).toMatch(/jellyfin:\n {16}name: Jellyfin # display name, kept when the eye is pressed\n {16}hide: false/);
    expect(live).toMatch(/paperless:\n {16}hide: true/);
    expect(new Set(editor.dockerRequests.map((r) => r.split(" ")[0]))).toEqual(new Set(["GET"]));

    // The live Glance lists only what the editor showed.
    const html = await (await page.request.get(`http://127.0.0.1:${editor.glancePort}/api/pages/home/content/`)).text();
    expect(html).toContain("Jellyfin");
    for (const hidden of ["paperless", "immich-server", "watchtower", "glance-editor", "old-nextcloud"]) expect(html, hidden).not.toContain(hidden);
  });

  test("showing a container again undoes what the eye wrote: no change left to save", async ({ page, editor }) => {
    const seed = editor.live();
    await importSeed(page, editor.url);
    await openWidget(page);
    await eye(page, "paperless").click();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await eye(page, "paperless").click(); // its entry goes again
    await eye(page, "glance-editor").click(); // shown: its entry goes, with its comment
    await eye(page, "glance-editor").click(); // hidden again: a new entry, in another place in the list
    await expect(eye(page, "glance-editor")).toHaveAttribute("aria-pressed", "false");
    // A map's order means nothing to Glance, so this is the file as it was (changes.ts).
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    expect(editor.live()).toBe(seed);
  });
});

test.describe("design 03: Docker socket unreachable", () => {
  test.use({ opts: { seed: fixture("docker.yml"), glance: true, docker: "dead" } });

  test("containers named in the map are still listed and can be toggled; new ones can't be discovered", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await openWidget(page);
    const ins = inspector(page);
    await expect(ins.getByText("Can't reach the Docker socket.")).toBeVisible({ timeout: 10_000 });
    await expect(ins.getByText(/Containers already named in the widget's map are still listed/)).toBeVisible();
    await expect(ins.getByText(/^No answer from http:\/\/127\.0\.0\.1:\d+ \(ECONNREFUSED\)$/)).toBeVisible();
    await expect(ins.locator(".crow")).toHaveCount(2);
    await expect(row(page, "glance-editor").getByText("State unknown · hidden")).toBeVisible();
    await expectAccessible(page, "containers unreachable");
    await expectTargets(page, "containers unreachable");
    await ins.getByText("Can't reach the Docker socket.").scrollIntoViewIfNeeded();
    await shot(page, "containers-unreachable", { fullPage: false });
    // Without the container's labels, the eye always writes hide, so a label can't decide the outcome.
    await eye(page, "jellyfin").click();
    await expect(eye(page, "jellyfin")).toHaveAttribute("aria-pressed", "false");
    await eye(page, "glance-editor").click();
    await expect(eye(page, "glance-editor")).toHaveAttribute("aria-pressed", "true");
    if (isPhone(page)) await ins.getByRole("button", { name: "Back to layout" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog", { name: "Review and save" }).getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    expect(editor.live()).toMatch(/glance-editor: # the editor itself\n {16}hide: false/);
    expect(editor.live()).toMatch(/name: Jellyfin # display name, kept when the eye is pressed\n {16}hide: true/);
  });
});

// ADR-0026: each container's settings in the widget's map: icon (the icon finder, with Unraid's own icon and
// suggestions from the image's name), name, URL, description, same tab. Glance shows them after Save.
test.describe("Container settings (ADR-0026)", () => {
  const UNRAID_ICON = "https://icons.invalid/jellyfin.png";
  test.use({ opts: { seed: fixture("docker.yml"), glance: true, icons: true, docker: [
    { name: "media", image: "lscr.io/linuxserver/jellyfin:latest", labels: { "net.unraid.docker.icon": UNRAID_ICON, "glance.description": "From a label" } },
    { name: "paperless", image: "ghcr.io/paperless-ngx/paperless-ngx:2.15" },
  ] } });

  test("open a container: Unraid's icon and suggestions by image; name, URL, description; labels show greyed", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await openWidget(page);
    const ins = inspector(page);
    await ins.getByRole("button", { name: "media settings" }).click();
    await expect(ins.getByLabel("Description", { exact: true })).toHaveAttribute("placeholder", "From a label");
    await ins.getByRole("button", { name: "Find icon for media" }).click();
    const finder = page.getByRole("dialog", { name: "Choose an icon" });
    await expect(finder.getByText("Icon · jellyfin")).toBeVisible(); // looked up by the image's name
    await expect(finder.getByRole("button", { name: /^Unraid's icon/ })).toBeVisible();
    await expect(finder.getByRole("button", { name: /si:jellyfin/ }).first()).toBeVisible();
    await expectAccessible(page, "container icon finder");
    await shot(page, "container-icon-finder");
    await finder.getByRole("button", { name: /^Unraid's icon/ }).click();
    await expect(ins.getByLabel("Icon", { exact: true })).toHaveValue(UNRAID_ICON);
    await ins.getByLabel("Name", { exact: true }).fill("Jellyfin");
    await ins.getByLabel("URL", { exact: true }).fill("https://media.example/");
    await expectAccessible(page, "container settings");
    await expectTargets(page, "container settings");
    await shot(page, "container-settings");
    if (isPhone(page)) await ins.getByRole("button", { name: "Back to layout" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog", { name: "Review and save" }).getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    const media = editor.live().split("              media:\n")[1] ?? "";
    for (const line of ["icon: https://icons.invalid/jellyfin.png", "name: Jellyfin", "url: https://media.example/"]) expect(media).toContain(`                ${line}\n`);

    const g = await page.context().newPage();
    await g.goto(`http://127.0.0.1:${editor.glancePort}/`);
    await g.locator(".content-ready").waitFor({ state: "attached" });
    const item = g.locator(".widget-type-docker-containers li", { hasText: "Jellyfin" }).first();
    await expect(item.locator(`img[src="${UNRAID_ICON}"]`)).toBeAttached();
    await expect(item.locator('a[href="https://media.example/"]')).toBeAttached();
    await expect(item.getByText("From a label")).toBeAttached(); // the label still applies where nothing is set
    await g.close();
  });
});

// A widget for another server's Docker: the section lists that server's containers, not the editor's own (ADR-0026
// follow-up). The editor's own Docker (DOCKER_PROXY_URL) and the other server's are two different stand-ins here.
test.describe("Another server's Docker", () => {
  test.use({ opts: { seed: fixture("remote-docker.yml"), glance: true, docker: [{ name: "local-only" }], remoteDocker: [{ name: "nas-plex" }, { name: "nas-sonarr" }] } });

  test("the section lists the containers at the widget's socket path; hiding one there is what Glance shows", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await page.locator(".wcard").getByRole("button", { name: /^Other server, / }).click();
    const ins = inspector(page);
    await expect(ins.getByText(/2 of 2 containers shown\. The list comes from the Docker at http:\/\/127\.0\.0\.1:\d+;/)).toBeVisible();
    await expect(row(page, "nas-plex")).toBeVisible();
    await expect(ins.getByText("local-only")).toHaveCount(0);
    expect(editor.remoteRequests).toContain("GET /containers/json?all=true");
    expect(editor.dockerRequests).toEqual([]);
    await eye(page, "nas-sonarr").click();
    if (isPhone(page)) await ins.getByRole("button", { name: "Back to layout" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog", { name: "Review and save" }).getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    const g = await page.context().newPage();
    await g.goto(`http://127.0.0.1:${editor.glancePort}/`);
    await g.locator(".content-ready").waitFor({ state: "attached" });
    await expect(g.getByText("nas-plex")).toBeVisible();
    await expect(g.getByText("nas-sonarr")).toHaveCount(0);
    await g.close();
  });
});

// ADR-0027 "Fill in icons and links": what the containers carry (Unraid's icon and WebUI), names tidied; only empty
// settings are filled, and Glance shows the result after Save.
test.describe("Fill in icons and links (ADR-0027)", () => {
  test.use({ opts: { seed: fixture("look.yml"), glance: true, assets: true, icons: true, docker: [
    { name: "plex", image: "plexinc/pms-docker", ports: [{ private: 32400, public: 32401 }],
      labels: { "net.unraid.docker.icon": "{{ICON_SITE}}/gh/unraid/plex.png", "net.unraid.docker.webui": "http://[IP]:[PORT:32400]/web" } },
    { name: "jellyfin_media", image: "lscr.io/linuxserver/jellyfin:latest" },
    { name: "custom", image: "example/zzz", labels: { "glance.url": "https://mine.example/", "net.unraid.docker.webui": "http://[IP]:[PORT:80]/" }, ports: [{ private: 80, public: 8081 }] },
  ] } });

  test("Unraid's icon downloaded, a library icon by image, Unraid's link filled in, a label kept; Glance shows them", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await page.locator(".wcard").getByRole("button", { name: /^Docker containers, / }).click();
    const ins = inspector(page);
    await ins.getByRole("button", { name: "Fill in icons and links" }).click();
    await expect(page.getByText("Filled in: 2 icons, 1 link, names tidied")).toBeVisible();
    await shot(page, "containers-filled");
    const origin = new URL(editor.url).hostname;
    if (isPhone(page)) await ins.getByRole("button", { name: "Back to layout" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog", { name: "Review and save" }).getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    const yml = editor.live();
    expect(yml).toContain("format-container-names: true");
    expect(yml).toContain("icon: /assets/icons/plex.png");
    expect(yml).toContain(`url: http://${origin}:32401/web`);
    expect(yml).toContain("icon: di:jellyfin");
    expect(yml).not.toContain(":8081/"); // custom's own glance.url label wins over Unraid's WebUI
    expect(yml).not.toMatch(/^\s+custom:/m); // and no library has an icon for it: nothing written
    const g = await page.context().newPage();
    await g.goto(`http://127.0.0.1:${editor.glancePort}/`);
    await g.locator(".content-ready").waitFor({ state: "attached" });
    const plex = g.locator(".widget-type-docker-containers li", { hasText: "Plex" }).first();
    await expect(plex.locator('img[src="/assets/icons/plex.png"]')).toBeAttached();
    await expect(plex.locator(`a[href="http://${origin}:32401/web"]`)).toBeAttached();
    await expect(g.getByText("Jellyfin Media")).toBeVisible(); // tidied by Glance
    await g.close();
  });
});

// ADR-0036: Glance v0.8.8 lists a child (glance.parent, no glance.id) under its parent, also when the widget lists one
// category; a child whose parent isn't listed isn't shown.
test.describe("Child containers (ADR-0036)", () => {
  test.use({ opts: { seed: fixture("docker.yml"), glance: true, docker: [
    { name: "immich-server", labels: { "glance.id": "immich", "glance.category": "media", "glance.name": "Immich" } },
    { name: "immich-db", labels: { "glance.parent": "immich", "glance.name": "Immich DB" } },
    { name: "paperless", labels: { "glance.category": "docs" } },
    { name: "redis", labels: { "glance.parent": "cache" } },
  ] } });

  test("in a category, the child shows under its parent; the editor's lines and the real Glance agree", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    const state = await (await page.request.get(`${editor.url}/api/state`)).json();
    state.draft.pages[0].columns[0].widgets[0].category = "media";
    expect((await (await page.request.put(`${editor.url}/api/draft`, { data: state.draft, headers: { origin: editor.url } })).json()).ok).toBe(true);
    await page.reload();
    await openWidget(page);
    const ins = inspector(page);
    await expect(ins.getByText("2 of 6 containers shown.", { exact: false })).toBeVisible();
    await expect(row(page, "Immich DB").getByText("Running · shown under “Immich”")).toBeVisible();
    await expect(row(page, "paperless").getByText("Not shown: this widget lists only the category “media”")).toBeVisible();
    await expect(row(page, "redis").getByText("Not shown: Glance lists it under the container with glance.id “cache”, and there is none")).toBeVisible();
    await row(page, "Immich DB").scrollIntoViewIfNeeded();
    await shot(page, "containers-children", { fullPage: false });
    if (isPhone(page)) await ins.getByRole("button", { name: "Back to layout" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("dialog", { name: "Review and save" }).getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    const html = await (await page.request.get(`http://127.0.0.1:${editor.glancePort}/api/pages/home/content/`)).text();
    for (const shown of ["Immich", "Immich DB"]) expect(html, shown).toContain(shown);
    for (const hidden of ["paperless", "redis"]) expect(html, hidden).not.toContain(hidden);
  });
});
