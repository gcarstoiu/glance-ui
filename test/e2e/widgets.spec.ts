// Plan v2 Phase 6 acceptance: flows "Add and configure a widget" (3) and "Edit bookmarks" (4) at desktop width and at
// 390 px, the widget steps of flows 1 and 6, a YAML override that round-trips unknown keys, and this phase's error and
// empty states. Each test runs the built editor against a real Glance (fixtures.ts). The icon finder has its own
// tests (icons.spec.ts); here the icon is typed.
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { GLANCE_VERSION, expect, expectAccessible, expectTargets, fixture, isPhone, mouseDrag, test } from "./fixtures.ts";
import { shot } from "./shots.ts";

async function importSeed(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("button", { name: /Import glance\.yml/ }).click();
  await page.getByRole("button", { name: /^Import \d+ pages?$/ }).click();
  await expect(page.getByLabel("Page name")).toBeVisible();
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog", { name: "Review and save" }).getByRole("button", { name: "Check and save" }).click();
}
/** The Values screen: the rail on desktop, the bottom tabs on a phone. */
async function openValues(page: Page) {
  await page.getByRole("button", { name: /^Values/ }).filter({ visible: true }).first().click();
  await expect(page.getByRole("heading", { name: "Values", exact: true })).toBeVisible();
}
const column = (page: Page, n: number) => page.getByRole("region", { name: `Column ${n}`, exact: true });
const inspector = (page: Page) => page.getByRole("complementary", { name: "Widget settings" });
const card = (page: Page, name: string) => page.locator(".wcard", { has: page.getByRole("button", { name: new RegExp(`^${name}, `) }) });
async function addWidget(page: Page, where: Locator, search: string, pick: RegExp, button = "Add widget") {
  await where.getByRole("button", { name: button }).click();
  const sheet = page.getByRole("dialog", { name: "Add widget" });
  await expect(sheet.getByLabel("Search widget types")).toBeFocused();
  await sheet.getByLabel("Search widget types").fill(search);
  await sheet.getByRole("button", { name: pick }).click();
  await expect(sheet).toBeHidden();
}
async function closeInspector(page: Page) {
  await inspector(page).getByRole("button", { name: isPhone(page) ? "Back to layout" : "Close settings" }).click();
  await expect(inspector(page)).toBeHidden();
}
/** The end of a column's (or the head strip's) list, shown while a widget is dragged (client/drag.ts list keys). */
const endZone = (page: Page, column: number | "head") => page.locator(`[data-drop-end][data-drop-list^="w|"][data-drop-list$="|${column}|"]`);
/** Drag a grip with the mouse (desktop, D-15) and drop it on `target` (found once the drag has started). */
const drag = mouseDrag;

test.describe("Flow 3: add and configure a widget", () => {
  test.use({ opts: { seed: fixture("home.yml"), glance: true } });

  test("add RSS by searching; fill the form; the YAML tab shows what will be written; save live", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await column(page, 1).getByRole("button", { name: "Add widget" }).click();
    const sheet = page.getByRole("dialog", { name: "Add widget" });
    await expect(sheet.getByText("Home › Column 1")).toBeVisible();
    await expectAccessible(page, "add widget");
    await expectTargets(page, "add widget");
    await shot(page, "add-widget");
    await sheet.getByLabel("Search widget types").fill("rss");
    await expect(sheet.getByRole("button")).toHaveCount(4); // RSS, Close and the two tabs (Widget types, Community)
    await sheet.getByRole("button", { name: /^RSS/ }).click();

    const ins = inspector(page);
    await expect(ins.getByRole("heading", { name: "RSS" })).toBeVisible();
    await expect(ins.getByText("Home › Column 1")).toBeVisible();
    await ins.getByLabel("Title", { exact: true }).fill("Tech news");
    await ins.getByLabel("Item limit").fill("10");
    await expect(ins.getByLabel("Item limit")).toHaveAttribute("placeholder", "25"); // Glance's default (v0.8.6 source)
    await ins.getByRole("button", { name: "Add feed" }).click();
    await ins.locator(".subcard", { hasText: "Feed 1" }).getByRole("textbox", { name: "Feed URL" }).fill("https://example.com/feed.xml");
    await ins.getByRole("textbox", { name: "Refresh data every" }).fill("90");
    await ins.getByRole("group", { name: "Refresh data every: unit" }).getByRole("button", { name: "minutes" }).click();
    await expect(card(page, "Tech news").getByText("1 feed")).toBeVisible();
    await expectAccessible(page, "inspector settings");
    await expectTargets(page, "inspector settings");
    await shot(page, "inspector-settings");

    await ins.getByRole("tab", { name: "YAML" }).click();
    await expect(ins.getByLabel("YAML for this widget")).toHaveValue(
      "type: rss\ntitle: Tech news\ncache: 90m\nlimit: 10\nfeeds:\n  - url: https://example.com/feed.xml\n",
    );
    await expectAccessible(page, "inspector yaml");
    await expectTargets(page, "inspector yaml");
    await shot(page, "inspector-yaml");
    await closeInspector(page);

    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    expect(editor.live()).toContain("          - type: calendar\n          - type: rss\n            title: Tech news\n            cache: 90m\n            limit: 10\n");
  });

  test("every type has a generated form; Markets fills a list of markets", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await addWidget(page, column(page, 2), "markets", /^Markets/);
    const ins = inspector(page);
    await ins.getByRole("button", { name: "Add market" }).click();
    await ins.locator(".subcard", { hasText: "Market 1" }).getByRole("textbox", { name: /^Symbol Required/ }).fill("BTC-USD");
    await ins.getByRole("group", { name: "Sort by" }).getByRole("button", { name: "change", exact: true }).click();
    await ins.getByRole("tab", { name: "YAML" }).click();
    await expect(ins.getByLabel("YAML for this widget")).toHaveValue("type: markets\nmarkets:\n  - symbol: BTC-USD\nsort-by: change\n");
  });

  test("groups: Add tab (Group and Split column disabled with the reason), one level at a time with a Back link", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await addWidget(page, column(page, 2), "group", /^Group\b/);
    const ins = inspector(page);
    await expect(ins.getByText("No tabs yet.")).toBeVisible();
    await ins.getByRole("button", { name: "Add tab" }).click();
    const sheet = page.getByRole("dialog", { name: "Add widget" });
    await expect(sheet.getByRole("heading", { name: "Add tab" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /^Group\b/ })).toBeDisabled();
    await expect(sheet.getByRole("button", { name: /^Split column\b/ })).toBeDisabled();
    await expect(sheet.getByText("A group can’t contain this.")).toHaveCount(2);
    await shot(page, "add-tab");
    await sheet.getByLabel("Search widget types").fill("hacker");
    await sheet.getByRole("button", { name: /^Hacker News/ }).click();
    await expect(ins.getByRole("heading", { name: "Hacker News" })).toBeVisible();
    await expect(ins.getByText("Home › Column 2 › Group")).toBeVisible();
    await ins.getByRole("button", { name: "Back to Group" }).click();
    await expect(ins.getByRole("heading", { name: "Group" })).toBeVisible();
    await expect(ins.getByRole("button", { name: /^Hacker News, Hacker News\. Open settings/ })).toBeVisible();
    await expectAccessible(page, "group children");
    await expectTargets(page, "group children");
    await shot(page, "group-children");
    await closeInspector(page);
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    expect(editor.live()).toContain("          - type: group\n            widgets:\n              - type: hacker-news\n");
  });

  test("reorder: the grip's move buttons everywhere, drag on desktop; delete with Undo", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    // The grip as a button (keyboard, phone, D-15). The keyboard stays on the card as it moves.
    const clock = card(page, "Clock");
    await clock.getByRole("button", { name: "Move Clock" }).click();
    await expect(clock.getByRole("group", { name: "Move or delete Clock" })).toBeVisible();
    await expectTargets(page, "move buttons");
    await shot(page, "move-buttons");
    await clock.getByRole("button", { name: "Move down" }).click();
    await expect(column(page, 1).locator(".wcard").last()).toContainText("Clock");
    await expect(clock.getByRole("button", { name: "Move Clock" })).toBeFocused(); // "Move down" is disabled at the end
    const services = () => card(page, "Services");
    await services().getByRole("button", { name: "Move Services" }).click();
    await services().getByRole("button", { name: "Move to next column" }).click();
    await expect(column(page, 3).locator(".wcard").last()).toContainText("Services");
    await expect(services().getByRole("button", { name: "Move Services" })).toBeFocused(); // last column
    await services().getByRole("button", { name: "Move to previous column" }).click();
    await expect(column(page, 2).locator(".wcard")).toContainText("Services");
    await expect(services().getByRole("button", { name: "Move to previous column" })).toBeFocused();
    await services().getByRole("button", { name: "Delete Services" }).click();
    await expect(page.getByText("Deleted Services from the draft")).toBeVisible();
    await expect(services()).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(services()).toHaveCount(1);

    if (!isPhone(page)) {
      // Drag with the mouse: into another column at the end, into the head strip, and a column by its grip.
      await drag(page, card(page, "Clock").getByRole("button", { name: "Move Clock" }), () => endZone(page, 1));
      await expect(column(page, 2).locator(".wcard").last()).toContainText("Clock");
      await drag(page, card(page, "Calendar").getByRole("button", { name: "Move Calendar" }), () => endZone(page, "head"));
      await expect(page.getByRole("region", { name: "Head widgets" }).locator(".wcard")).toContainText("Calendar");
      await expect(column(page, 1).getByText("No widgets in this column yet.")).toBeVisible();
      await drag(page, page.getByRole("button", { name: "Move column 3", exact: true }), () => column(page, 1));
      await expect(column(page, 1).locator(".wcard")).toContainText("To-do");
      await shot(page, "after-drag");
    }
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    expect(editor.live()).toContain("title: Services # kept next to its value"); // moved with its comment (ADR-0015)
  });
});

test.describe("Flow 1 and Flow 6, widget steps", () => {
  test("from scratch: Start empty, add Weather to column 2, fill the location, save version 1", async ({ page, editor }) => {
    await page.goto(editor.url);
    await page.getByRole("button", { name: /Start empty/ }).click();
    await page.getByLabel("Page name").fill("Home");
    await page.getByRole("button", { name: "Small + full + small" }).click();
    await page.getByRole("button", { name: "Create page" }).click();
    await addWidget(page, column(page, 2), "weather", /^Weather/);
    const ins = inspector(page);
    await expect(ins.getByText("Updates on the hour. Glance doesn’t allow changing this for this widget.")).toBeVisible(); // D-58
    await ins.getByRole("textbox", { name: /^Location/ }).fill("Oslo, Norway");
    await ins.getByRole("group", { name: "Units" }).getByRole("button", { name: "imperial" }).click();
    await closeInspector(page);
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is written" })).toBeVisible();
    expect(editor.live()).toContain("      - size: full\n        widgets:\n          - type: weather\n            location: Oslo, Norway\n            units: imperial\n");
  });

  test.describe("with a file", () => {
    test.use({ opts: { seed: fixture("home.yml"), glance: true } });

    test("an empty required field blocks Save; Go to opens the widget with the field highlighted; typing fixes it", async ({ page, editor }) => {
      await importSeed(page, editor.url);
      await addWidget(page, column(page, 1), "weather", /^Weather/);
      await closeInspector(page);
      await save(page);
      const problems = page.getByRole("dialog", { name: "Problems" });
      await expect(problems.getByRole("heading", { name: "1 problem found" })).toBeVisible();
      await expect(problems.getByText("Editor check · Home › Column 1 › Weather")).toBeVisible();
      await expect(problems.getByText("Location", { exact: true })).toBeVisible();
      await expect(card(page, "Weather").getByText("Fix")).toBeVisible();
      await problems.getByRole("button", { name: "Go to" }).click();
      const ins = inspector(page);
      await expect(ins.getByRole("textbox", { name: /^Location/ })).toBeFocused();
      await expect(ins.locator(".field.hl")).toContainText("Location");
      await expect(ins.getByText("Location is required. Glance won't accept the config without it.")).toBeVisible();
      await shot(page, "field-problem");
      await ins.getByRole("textbox", { name: /^Location/ }).fill("Berlin, Germany");
      await closeInspector(page);
      await expect(page.getByText("1 problem to fix before saving.")).toBeHidden();
      await save(page);
      await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    });

    test("a value the draft can't hold stays in the field, outlined, and blocks Save until fixed (design 03)", async ({ page, editor }) => {
      await importSeed(page, editor.url);
      await addWidget(page, column(page, 1), "rss", /^RSS/);
      const ins = inspector(page);
      await ins.getByLabel("Item limit").fill("ten");
      await expect(ins.getByLabel("Item limit")).toHaveAttribute("aria-invalid", "true");
      await expect(ins.getByText("Use a whole number.")).toBeVisible();
      const before = editor.live();
      await closeInspector(page);
      await save(page);
      const problems = page.getByRole("dialog", { name: "Problems" });
      await expect(problems.getByText("Item limit")).toBeVisible();
      await problems.getByRole("button", { name: "Go to" }).click();
      await expect(ins.getByLabel("Item limit")).toBeFocused();
      await ins.getByLabel("Item limit").fill("10");
      await expect(ins.getByText("Use a whole number.")).toBeHidden();
      expect(editor.live()).toBe(before);
    });

    test("ADR-0036: Reddit Search without App authentication blocks Save at its field; a title link Glance drops is a warning", async ({ page, editor }) => {
      await importSeed(page, editor.url);
      const state = await (await page.request.get(`${editor.url}/api/state`)).json();
      state.draft.pages[0].columns[0].widgets.push({ _id: "r", type: "reddit", subreddit: "selfhosted", search: "glance", "title-url": "smb://nas.example/share" });
      expect((await (await page.request.put(`${editor.url}/api/draft`, { data: state.draft, headers: { origin: editor.url } })).json()).ok).toBe(true);
      await page.reload();
      await page.getByRole("button", { name: "Save", exact: true }).click();
      const review = page.getByRole("dialog", { name: "Review and save" });
      await expect(review.getByText("1 thing to check (saving still works)")).toBeVisible();
      await expect(review.getByText("Glance makes this a dead link: it keeps only links that start with http://, https:// or mailto:, or paths on this server.")).toBeVisible();
      await shot(page, "review-dead-link");
      await review.getByRole("button", { name: "Check and save" }).click();
      const problems = page.getByRole("dialog", { name: "Problems" });
      await expect(problems.getByText("Search works only with App authentication, since Reddit changed its API. Fill in App authentication, or clear Search.")).toBeVisible();
      await problems.getByRole("button", { name: "Go to" }).click();
      const ins = inspector(page);
      await expect(ins.locator(".field.hl")).toContainText("Search");
      await expect(ins.getByText("Works only with App authentication, since Reddit changed its API.", { exact: true })).toBeVisible();
      await expect(ins.getByRole("textbox", { name: /^Search/ })).toHaveAttribute("aria-invalid", "true");
      await shot(page, "reddit-search-app-auth", { fullPage: false });
      await ins.getByRole("textbox", { name: /^Search/ }).fill("");
      await closeInspector(page);
      await save(page);
      await expect(page.getByRole("heading", { name: /^Version 1 is (live|written)$/ })).toBeVisible();
      expect(editor.live()).toContain("title-url: smb://nas.example/share");
      expect(editor.live()).not.toContain("search: glance");
    });
  });
});

test.describe("YAML override (D-12): round-trips unknown keys", () => {
  test.use({ opts: { seed: fixture("home.yml"), glance: true } });

  test("apply YAML with a key Glance doesn't know: the form goes read-only, the key is written and kept", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await card(page, "Clock").getByRole("button", { name: /^Clock, / }).click();
    const ins = inspector(page);
    await ins.getByRole("tab", { name: "YAML" }).click();
    const box = ins.getByLabel("YAML for this widget");
    await expect(box).toHaveValue("type: clock\nhour-format: 24h\n");
    await box.fill("type: clock\nhour-format: 12h # changed in YAML\nfuture-option: true\n");
    await ins.getByRole("button", { name: "Apply YAML" }).click();
    await expect(ins.getByText(`"future-option" isn't a key Glance ${GLANCE_VERSION} uses here; it is kept as written.`)).toBeVisible();
    await ins.getByRole("tab", { name: "Settings" }).click();
    await expect(ins.getByText("This widget is edited as YAML, so the form is read-only.")).toBeVisible();
    await expect(ins.getByRole("group", { name: "Hour format" }).getByRole("button", { name: "12h" })).toBeDisabled();
    await expect(card(page, "Clock").getByText("Edited as YAML")).toBeVisible();
    await shot(page, "yaml-override");
    await closeInspector(page);
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    expect(editor.live()).toContain("          - type: clock\n            hour-format: 12h # changed in YAML\n            future-option: true\n");
    // After the save the widget is back in the form; the unknown key stays for the next save.
    await page.getByRole("button", { name: "Done" }).click();
    await card(page, "Clock").getByRole("button", { name: /^Clock, / }).click();
    await expect(ins.getByText("This widget is edited as YAML")).toBeHidden();
    await ins.getByRole("tab", { name: "YAML" }).click();
    await expect(ins.getByLabel("YAML for this widget")).toHaveValue(/future-option: true/);
  });

  test("YAML that doesn't parse is refused with its line; Revert brings back the text; Discard override restores the form", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await card(page, "Clock").getByRole("button", { name: /^Clock, / }).click();
    const ins = inspector(page);
    await ins.getByRole("tab", { name: "YAML" }).click();
    const box = ins.getByLabel("YAML for this widget");
    await box.fill("type: clock\nhour-format: 24h\n  bad: x\n");
    await ins.getByRole("button", { name: "Apply YAML" }).click();
    await expect(ins.getByText(/^Line 2: /)).toBeVisible();
    await ins.getByRole("button", { name: "Revert" }).click();
    await expect(box).toHaveValue("type: clock\nhour-format: 24h\n");
    await box.fill("type: clock\nhour-format: 12h\n");
    await ins.getByRole("button", { name: "Apply YAML" }).click();
    await ins.getByRole("tab", { name: "Settings" }).click();
    await ins.getByRole("button", { name: "Discard YAML override" }).click();
    await expect(ins.getByRole("group", { name: "Hour format" }).getByRole("button", { name: "24h" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    expect(editor.live()).toContain("hour-format: 24h");
  });
});

test.describe("Flow 4: edit bookmarks", () => {
  test.use({ opts: { seed: fixture("home.yml"), glance: true } });

  test("groups and links: colour from swatches or the picker, one link open at a time, reorder, delete with Undo, save", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await card(page, "Services").getByRole("button", { name: /^Services, / }).click();
    const ins = inspector(page);
    const group = ins.locator(".bgroup").first();
    await expect(group.getByLabel("Group 1 title")).toHaveValue("Media");
    const colours = group.getByRole("group", { name: "Group 1 colour" });
    await expect(colours.getByRole("button", { name: "Theme primary" })).toHaveAttribute("aria-pressed", "true");
    // D-57: with Glance's default theme the swatches start with its negative colour, then hues around the primary.
    await colours.getByRole("button", { name: "88 50 70" }).click();
    await expect(colours.getByRole("button", { name: "88 50 70" })).toHaveAttribute("aria-pressed", "true");
    // The picker: a hex colour, saved to My colours (D-51).
    await colours.getByRole("button", { name: "Add a colour with the picker" }).click();
    await ins.getByLabel("Or paste a hex colour").fill("#336699");
    await expect(ins.getByText("210 50 40", { exact: true })).toBeVisible();
    await expectAccessible(page, "bookmarks with picker");
    await expectTargets(page, "bookmarks with picker");
    await shot(page, "bookmarks-picker");
    await ins.getByRole("button", { name: "Use and add to my colours" }).click();
    await expect(page.getByText("Added to my colours")).toBeVisible();
    await expect(colours.getByRole("button", { name: "My colour 210 50 40" })).toHaveAttribute("aria-pressed", "true");

    // Links collapse to one row; one open at a time (D-19).
    await group.getByRole("button", { name: "Add link" }).click();
    await group.getByRole("textbox", { name: /^Title/ }).fill("Docs");
    await group.getByRole("textbox", { name: /^URL/ }).fill("${DOCS_URL}");
    await expect(group.getByText("Environment variables such as ${NAME} are kept as written.")).toBeVisible();
    await group.getByRole("textbox", { name: "Icon" }).fill("si:readthedocs");
    await group.getByRole("button", { name: /^Example/ }).click();
    await expect(group.getByRole("textbox", { name: /^Title/ })).toHaveValue("Example");
    await expect(group.locator(".blink.open")).toHaveCount(1);
    await group.getByRole("button", { name: "Move link down" }).click();
    await expect(group.locator(".blinkmain").first()).toContainText("Docs");
    await shot(page, "bookmarks");
    await group.getByRole("button", { name: "Delete link" }).click();
    await expect(group.locator(".blinkmain")).toHaveCount(1);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(group.locator(".blinkmain")).toHaveCount(2);

    // A second group: empty states, then delete with Undo.
    await ins.getByRole("button", { name: "Add group" }).click();
    const second = ins.locator(".bgroup").nth(1);
    await expect(second.getByText("No links in this group.")).toBeVisible();
    await second.getByRole("button", { name: /^Delete group/ }).click();
    await expect(ins.locator(".bgroup")).toHaveCount(1);

    // The YAML tab shows the placeholder as typed (D-37). The live save uses a plain URL (the test Glance has no env).
    await ins.getByRole("tab", { name: "YAML" }).click();
    await expect(ins.getByLabel("YAML for this widget")).toHaveValue(/url: \$\{DOCS_URL\}/);
    await ins.getByRole("tab", { name: "Settings" }).click();
    await group.getByRole("button", { name: /^Docs/ }).click();
    await group.getByRole("textbox", { name: /^URL/ }).fill("https://docs.example.com/");
    await closeInspector(page);
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    const live = editor.live();
    expect(live).toContain("title: Services # kept next to its value");
    expect(live).toContain("color: 210 50 40");
    expect(live).toMatch(/- title: Docs\n\s+url: https:\/\/docs\.example\.com\/\n\s+icon: si:readthedocs\n\s+- title: Example\n\s+url: https:\/\/example\.com\//);

    // My colours are kept by the editor (not in glance.yml) and come back after a reload.
    await page.reload();
    await card(page, "Services").getByRole("button", { name: /^Services, / }).click();
    await expect(inspector(page).getByRole("button", { name: "My colour 210 50 40" })).toBeVisible();
  });

  test("a new Bookmarks widget says it needs a group with links", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await addWidget(page, column(page, 1), "bookmarks", /^Bookmarks/);
    await expect(inspector(page).getByText("No groups. Glance needs at least one group with links to show anything.")).toBeVisible();
    await shot(page, "bookmarks-empty");
  });
});

test.describe("states", () => {
  test.use({ opts: { seed: fixture("home.yml") } });

  test("no widget type matches the search", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await column(page, 1).getByRole("button", { name: "Add widget" }).click();
    const sheet = page.getByRole("dialog", { name: "Add widget" });
    await sheet.getByLabel("Search widget types").fill("zzzz");
    await expect(sheet.getByText("No widget type matches.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("an unknown widget type is kept as written and edited in YAML; without Docker the containers section says so", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    const state = await (await page.request.get(`${editor.url}/api/state`)).json();
    state.draft.pages[0].columns[0].widgets.push({ _id: "future", type: "future-widget", _raw: { title: "Later" } });
    state.draft.pages[0].columns[0].widgets.push({ _id: "dk", type: "docker-containers" });
    await page.request.put(`${editor.url}/api/draft`, { data: state.draft, headers: { origin: editor.url } });
    await page.reload();
    await card(page, "Later").getByRole("button", { name: /^Later, / }).click();
    await expect(inspector(page).getByText(`Glance ${GLANCE_VERSION} has no widget type “future-widget”.`)).toBeVisible();
    await closeInspector(page);
    await card(page, "Docker containers").getByRole("button", { name: /^Docker containers, / }).click();
    await expect(inspector(page).getByText("Can't reach the Docker socket.")).toBeVisible(); // design 03
    await expect(inspector(page).getByText("The editor has no Docker connection set up.")).toBeVisible();
  });
});

// ADR-0028, ADR-0030: the Community tab of Add widget, with the community widgets bundled with this release.
test.describe("Community widgets (ADR-0028)", () => {
  test.use({ opts: { seed: fixture("home.yml"), glance: true } });

  test("pick one: its variants, labelled fields, Show YAML; one that can't be set up with fields says why", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await column(page, 2).getByRole("button", { name: "Add widget" }).click();
    const sheet = page.getByRole("dialog", { name: "Add widget" });
    await sheet.getByRole("button", { name: "Community", exact: true }).click();
    await expect(sheet.getByText(`Made by Glance users and shared under CC0. Each one was checked with Glance ${GLANCE_VERSION}`, { exact: false })).toBeVisible();
    // ADR-0033: marked early alpha above the list.
    await expect(sheet.getByRole("note").filter({ hasText: "Community widgets are in early alpha." })).toContainText("Not every one works out of the box without code");
    await expect(sheet.getByRole("link", { name: "glanceapp/community-widgets" })).toHaveAttribute("href", "https://github.com/glanceapp/community-widgets");
    await expectAccessible(page, "community list");
    await expectTargets(page, "community list");
    await shot(page, "community-list", { fullPage: false });

    // One that needs a helper program: listed with the reason, no Add.
    await sheet.getByLabel("Search community widgets").fill("docker swarm");
    await expect(sheet.getByRole("button", { name: /^Docker Swarm.*Can't be added/ })).toBeVisible();
    await sheet.getByRole("button", { name: /^Docker Swarm/ }).click();
    await expect(sheet.getByText(/^Can't be added: /)).toBeVisible();
    await expect(sheet.getByRole("button", { name: /^Add Docker Swarm/ })).toHaveCount(0);
    await sheet.getByRole("button", { name: "All community widgets" }).click();

    // One that needs values: a labelled field with help for each.
    await sheet.getByLabel("Search community widgets").fill("jellyfin stats");
    await sheet.getByRole("button", { name: /^Jellyfin Stats Live active playback/ }).click();
    await expect(sheet.getByText("What it needs (2)")).toBeVisible();
    await expect(sheet.getByLabel("Jellyfin (or Emby) address", { exact: true })).toBeVisible();
    await expect(sheet.getByText("Like http://192.0.2.10:8096, no slash at the end")).toBeVisible();
    await expect(sheet.getByLabel("Jellyfin (or Emby) API key", { exact: true })).toHaveAttribute("type", "password");
    // The YAML is folded away; it shows the ${NAMES} the fields fill in.
    await expect(sheet.locator("pre")).toHaveCount(0);
    await sheet.getByRole("button", { name: "Show YAML" }).click();
    await expect(sheet.locator("pre")).toContainText("${JELLYFIN_URL}");
    await sheet.getByRole("button", { name: "All community widgets" }).click();

    // Two variants; the second one is added; it needs nothing.
    await sheet.getByLabel("Search community widgets").fill("AFL");
    await sheet.getByRole("button", { name: /^AFL Widgets/ }).click();
    await sheet.getByRole("group", { name: "Variant" }).getByRole("button", { name: "Ladder" }).click();
    await expect(sheet.getByText("Nothing to fill in.")).toBeVisible();
    await expectAccessible(page, "community widget");
    await expectTargets(page, "community widget");
    await shot(page, "community-widget", { fullPage: false });
    await sheet.getByRole("button", { name: "Add AFL Widgets" }).click();
    await expect(page.getByText("Added AFL Widgets")).toBeVisible();
    await expect(inspector(page)).toBeVisible();
    if (isPhone(page)) await inspector(page).getByRole("button", { name: "Back to layout" }).click();
    await save(page);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();
    expect(editor.live()).toContain("api.squiggle.com.au");
    expect(editor.live()).toContain("type: custom-api");
  });
});

// ADR-0029, ADR-0030: values for ${VARIABLES}, filled in where they're needed and kept in .env (never in glance.yml);
// labelled and tidied for their field, and checked with Glance before they're stored.
test.describe("Values (ADR-0029, ADR-0030)", () => {
  test.use({ opts: { seed: fixture("home.yml"), glance: true, glanceEnvNames: ["PATH", "TZ"] } });

  test("filled in while adding a community widget; the eye; the Values screen; a value Glance can't load is refused", async ({ page, editor }) => {
    const envPath = join(dirname(editor.configPath), ".env");
    await importSeed(page, editor.url);
    await column(page, 2).getByRole("button", { name: "Add widget" }).click();
    const sheet = page.getByRole("dialog", { name: "Add widget" });
    await sheet.getByRole("button", { name: "Community", exact: true }).click();
    await sheet.getByLabel("Search community widgets").fill("jellyfin stats");
    await sheet.getByRole("button", { name: /^Jellyfin Stats Live active playback/ }).click();
    const address = sheet.getByLabel("Jellyfin (or Emby) address", { exact: true });
    await address.fill("192.0.2.10:8096/");
    await address.blur();
    await expect(address).toHaveValue("http://192.0.2.10:8096"); // an address is tidied as it's left
    const key = sheet.getByLabel("Jellyfin (or Emby) API key", { exact: true });
    await key.fill("abc 123");
    await expect(key).toHaveAttribute("type", "password"); // a key is hidden…
    await sheet.getByRole("button", { name: "Show Jellyfin (or Emby) API key" }).click();
    await expect(key).toHaveAttribute("type", "text"); // …until the eye is pressed
    await expectAccessible(page, "community values");
    await expectTargets(page, "community values");
    await shot(page, "community-values", { fullPage: false });
    await sheet.getByRole("button", { name: "Add Jellyfin Stats" }).click();
    await expect(page.getByText("Added Jellyfin Stats")).toBeVisible();
    expect(readFileSync(envPath, "utf8")).toBe('JELLYFIN_URL=http://192.0.2.10:8096\nJELLYFIN_API_KEY="abc 123"\n');

    if (isPhone(page)) await inspector(page).getByRole("button", { name: "Back to layout" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Review and save" });
    await expect(review.getByText(/has no value/)).toHaveCount(0);
    await review.getByRole("button", { name: "Check and save" }).click();
    // This test's Glance doesn't read .env (the container's does: test/all-in-one.sh), so the reload may not be
    // confirmed; glance.yml is written all the same.
    await expect(page.getByRole("heading", { name: /^Version 1 is (live|written)$/ })).toBeVisible({ timeout: 30_000 });
    expect(editor.live()).toContain("${JELLYFIN_API_KEY}"); // glance.yml keeps the placeholders
    expect(editor.live()).not.toContain("abc 123");

    // The Values screen: labels and help; a value Glance can't load the dashboard with is refused, with its reason.
    await page.goto(`${editor.url}/`);
    await openValues(page);
    await expect(page.getByLabel("Jellyfin (or Emby) address", { exact: true })).toHaveValue("http://192.0.2.10:8096");
    await page.getByLabel("Jellyfin (or Emby) address", { exact: true }).fill("http://192.0.2.10:port");
    const row = page.locator(".panel", { has: page.getByLabel("Jellyfin (or Emby) address", { exact: true }) });
    await row.getByRole("button", { name: "Store" }).click();
    await expect(row.getByRole("alert")).toHaveText(/^With this value Glance can't load your dashboard: .*invalid port/);
    expect(readFileSync(envPath, "utf8")).toContain("JELLYFIN_URL=http://192.0.2.10:8096\n");
    await expectAccessible(page, "values screen");
    await expectTargets(page, "values screen");
    await shot(page, "values-screen");
  });
});

// ADR-0030: More options with their defaults, the settings panel of a community widget (title, cache, values), and a
// second copy with its own values.
test.describe("Community widgets without YAML (ADR-0030)", () => {
  test.use({ opts: { seed: fixture("home.yml"), glance: true, glanceEnvNames: ["PATH", "TZ"] } });

  test("options under More options; title, cache and values in its settings; a second copy with its own values", async ({ page, editor }) => {
    const envPath = join(dirname(editor.configPath), ".env");
    await importSeed(page, editor.url);
    await column(page, 2).getByRole("button", { name: "Add widget" }).click();
    const sheet = page.getByRole("dialog", { name: "Add widget" });
    await sheet.getByRole("button", { name: "Community", exact: true }).click();
    await sheet.getByLabel("Search community widgets").fill("jellyfin latest");
    await sheet.getByRole("button", { name: /^Jellyfin Latest/ }).click();
    await sheet.getByLabel("Jellyfin (or Emby) address", { exact: true }).fill("http://192.0.2.10:8096");
    await sheet.getByLabel("Jellyfin (or Emby) API key", { exact: true }).fill("k3y");
    await sheet.getByLabel("Jellyfin user name", { exact: true }).fill("viewer");
    await sheet.getByLabel("Library name", { exact: true }).fill("Shows");
    await expect(sheet.getByLabel("What to show", { exact: true })).toHaveCount(0); // folded
    await sheet.getByRole("button", { name: "More options (5)" }).click();
    await expect(sheet.getByLabel("What to show", { exact: true })).toHaveValue("latest"); // its default
    await sheet.getByLabel("What to show", { exact: true }).selectOption("nextup");
    await expect(sheet.getByLabel("Number of items", { exact: true })).toHaveValue("10");
    await expectAccessible(page, "community options");
    await expectTargets(page, "community options");
    await shot(page, "community-options", { fullPage: false });
    await sheet.getByRole("button", { name: /^Add Jellyfin Latest/ }).click();
    await expect(page.getByText(/^Added Jellyfin Latest/)).toBeVisible();
    const env = readFileSync(envPath, "utf8");
    expect(env).toContain("JELLYFIN_LATEST_MODE=nextup\n");
    expect(env).toContain("JELLYFIN_LATEST_ITEM_COUNT=10\n"); // optional values are stored with their defaults

    // Its settings: no form behind it, so no Discard; title and cache written into its YAML; its values.
    const ins = inspector(page);
    await expect(ins.getByText("This widget is kept as YAML. Its title, cache and values are here; everything else is in the YAML tab.")).toBeVisible();
    const alpha = ins.getByRole("note").filter({ hasText: "Community widgets are in early alpha:" });
    await expect(alpha).toContainText("this one may need a change in its YAML");
    await alpha.scrollIntoViewIfNeeded();
    await shot(page, "community-alpha-settings", { fullPage: false });
    await expect(ins.getByRole("button", { name: "Discard YAML override" })).toHaveCount(0);
    await ins.getByLabel("Title", { exact: true }).fill("My shows");
    await ins.getByLabel("Cache", { exact: true }).fill("30m");
    await ins.getByLabel("Cache", { exact: true }).blur();
    await ins.getByLabel("Number of items", { exact: true }).fill("12");
    await ins.getByRole("button", { name: "Store Number of items" }).click();
    await expect(page.getByText(/^Stored Number of items\./)).toBeVisible();
    expect(readFileSync(envPath, "utf8")).toContain("JELLYFIN_LATEST_ITEM_COUNT=12\n");
    await expectAccessible(page, "community widget settings");
    await expectTargets(page, "community widget settings");
    await shot(page, "community-settings", { fullPage: false });
    if (isPhone(page)) await ins.getByRole("button", { name: "Back to layout" }).click();

    // A second Jellyfin widget: it can share the first one's values or have its own.
    await column(page, 2).getByRole("button", { name: "Add widget" }).click();
    await sheet.getByRole("button", { name: "Community", exact: true }).click();
    await sheet.getByLabel("Search community widgets").fill("jellyfin stats");
    await sheet.getByRole("button", { name: /^Jellyfin Stats Live active playback/ }).click();
    await expect(sheet.getByText(/uses some of the same values/)).toBeVisible();
    await sheet.getByRole("group", { name: "Values for this copy" }).getByRole("button", { name: "Its own" }).click();
    await sheet.getByLabel("Jellyfin (or Emby) address (copy 2)", { exact: true }).fill("http://192.0.2.20:8096");
    await sheet.getByLabel("Jellyfin (or Emby) API key (copy 2)", { exact: true }).fill("other");
    await sheet.getByRole("button", { name: "Add Jellyfin Stats" }).click();
    await expect(page.getByText("Added Jellyfin Stats")).toBeVisible();
    expect(readFileSync(envPath, "utf8")).toContain("JELLYFIN_URL_2=http://192.0.2.20:8096\n");
    if (isPhone(page)) await inspector(page).getByRole("button", { name: "Back to layout" }).click();
    await save(page);
    await expect(page.getByRole("heading", { name: /^Version 1 is (live|written)$/ })).toBeVisible({ timeout: 30_000 });
    const live = editor.live();
    expect(live).toContain("title: My shows");
    expect(live).toContain("cache: 30m");
    expect(live).toContain("${JELLYFIN_URL_2}");
    expect(live).toContain("${JELLYFIN_URL}");
  });
});

// ADR-0032: a community widget tried against its service. The stand-in answers as Uptime Kuma 2.5.7's source does: JSON
// on its status page API, its web page (200) on every other address; a second one plays a sign-in page on another port.
test.describe("Trying a widget against its service (ADR-0032)", () => {
  test.use({ opts: { seed: fixture("home.yml"), glance: true, glanceEnvNames: ["PATH", "TZ"] } });

  test("a pasted page address is cut back; the service answers; a wrong port says why; an empty slug is refused", async ({ page, editor }) => {
    const html = (title: string) => `<!DOCTYPE html><html><head><title>${title}</title></head><body></body></html>`;
    const kuma = createServer((req, res) => {
      const path = new URL(req.url ?? "/", "http://x").pathname;
      const json = (body: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
      if (/^\/api\/status-page\/heartbeat\/home\/?$/.test(path)) return json({ heartbeatList: { 1: [{ status: 1, ping: 9 }] }, uptimeList: {} });
      if (/^\/api\/status-page\/home\/?$/.test(path)) return json({ publicGroupList: [{ monitorList: [{ id: 1, name: "Example service" }] }] });
      res.writeHead(200, { "content-type": "text/html" });
      res.end(html("Uptime Kuma"));
    });
    const other = createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html("Sign in")); });
    const listen = (s: Server) => new Promise<string>((r) => s.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)));
    const base = await listen(kuma);
    const signIn = await listen(other);
    try {
      const envPath = join(dirname(editor.configPath), ".env");
      await importSeed(page, editor.url);
      await column(page, 2).getByRole("button", { name: "Add widget" }).click();
      const sheet = page.getByRole("dialog", { name: "Add widget" });
      await sheet.getByRole("button", { name: "Community", exact: true }).click();
      await sheet.getByLabel("Search community widgets").fill("uptime kuma");
      await sheet.getByRole("button", { name: /^Uptime Kuma/ }).click();
      // Pasted from the browser: the dashboard's address, and the status page's address for the slug.
      const address = sheet.getByLabel("Uptime Kuma address", { exact: true });
      await address.fill(`${base}/dashboard`);
      await address.blur();
      await expect(address).toHaveValue(base);
      await expect(sheet.getByText("Removed /dashboard: only the server and port are needed.")).toBeVisible();
      const slug = sheet.getByLabel("Status page slug", { exact: true });
      await slug.fill(`${base}/status/home`);
      await slug.blur();
      await expect(slug).toHaveValue("home");
      await expect(sheet.getByText("Took home out of the address.")).toBeVisible();
      await expectAccessible(page, "pasted addresses");
      await shot(page, "try-pasted", { fullPage: false });
      await sheet.getByRole("button", { name: "Add Uptime Kuma" }).click();
      await expect(page.getByText("Added Uptime Kuma")).toBeVisible();
      expect(readFileSync(envPath, "utf8")).toBe(`UPTIME_KUMA_URL=${base}\nUPTIME_KUMA_STATUS_SLUG=home\n`);

      // Its settings open: the service is asked, as Glance asks it.
      const ins = inspector(page);
      await expect(ins.getByText("The service answered: Glance shows this widget without an error.")).toBeVisible({ timeout: 20_000 });
      await expectAccessible(page, "service answered");
      await expectTargets(page, "service answered");
      await ins.getByRole("button", { name: "Try again" }).scrollIntoViewIfNeeded();
      await shot(page, "try-answered", { fullPage: false });

      // The port of a sign-in page: stored, and the reason in plain words with Glance's own text.
      await ins.getByLabel("Uptime Kuma address", { exact: true }).fill(signIn);
      await ins.getByRole("button", { name: "Store Uptime Kuma address" }).click();
      await expect(ins.getByText(/^The address answered with a web page, not with data\./)).toBeVisible({ timeout: 20_000 });
      await expect(ins.getByText("Glance says: invalid response JSON")).toBeVisible();
      await expectAccessible(page, "service failed");
      await expectTargets(page, "service failed");
      await ins.getByRole("button", { name: "Try again" }).scrollIntoViewIfNeeded();
      await shot(page, "try-failed", { fullPage: false });

      // A slug the widget needs can't be stored empty.
      await ins.getByLabel("Status page slug", { exact: true }).fill("");
      await ins.getByRole("button", { name: "Store Status page slug" }).click();
      await expect(ins.getByRole("alert")).toHaveText("Status page slug can't be empty: the widget needs it.");
      expect(readFileSync(envPath, "utf8")).toContain("UPTIME_KUMA_STATUS_SLUG=home\n");

      // Back to the right address (pasted with its page again), and Try again.
      await ins.getByLabel("Uptime Kuma address", { exact: true }).fill(`${base}/status/home`);
      await ins.getByLabel("Uptime Kuma address", { exact: true }).blur();
      await ins.getByRole("button", { name: "Store Uptime Kuma address" }).click();
      await expect(ins.getByText("The service answered: Glance shows this widget without an error.")).toBeVisible({ timeout: 20_000 });
      await ins.getByRole("button", { name: "Try again" }).click();
      await expect(ins.getByText("The service answered: Glance shows this widget without an error.")).toBeVisible({ timeout: 20_000 });
      expect(readFileSync(envPath, "utf8")).toBe(`UPTIME_KUMA_URL=${base}\nUPTIME_KUMA_STATUS_SLUG=home\n`);
    } finally {
      for (const s of [kuma, other]) { s.closeAllConnections(); s.close(); }
    }
  });
});
