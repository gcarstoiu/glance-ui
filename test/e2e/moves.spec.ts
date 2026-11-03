// ADR-0031: moving things by their grip. Bookmark links between groups and onto another Bookmarks widget, whole groups;
// widgets into and out of a group; Move to… (a tap on a grip, or the card's move buttons); pages in the rail; slides.
// Mouse drag at desktop width; a finger (real touch events) at 390 px; Undo; axe and 44 px targets on the new controls.
import type { CDPSession, Locator, Page } from "@playwright/test";
import { dropPoint, expect, expectAccessible, expectTargets, fixture, followTarget, isPhone, mouseDrag, test } from "./fixtures.ts";
import { shot } from "./shots.ts";

async function importSeed(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("button", { name: /Import glance\.yml/ }).click();
  await page.getByRole("button", { name: /^Import \d+ pages?$/ }).click();
  await expect(page.getByLabel("Page name")).toBeVisible();
}
const column = (page: Page, n: number) => page.getByRole("region", { name: `Column ${n}`, exact: true });
const inspector = (page: Page) => page.getByRole("complementary", { name: "Widget settings" });
const card = (page: Page, name: string) => page.locator(".wcard", { has: page.getByRole("button", { name: new RegExp(`^${name}, `) }) });
const openCard = (page: Page, name: string) => card(page, name).getByRole("button", { name: new RegExp(`^${name}, `) }).click();

/** A drag with a finger: real touch events through Chromium's DevTools protocol (they become pointer events). */
async function touchDrag(page: Page, grip: Locator, target: () => Locator) {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const touch = (type: string, x?: number, y?: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: x === undefined ? [] : [{ x, y: y! }] } as never);
  const g = (await grip.boundingBox())!;
  const a = { x: g.x + g.width / 2, y: g.y + g.height / 2 };
  await touch("touchStart", a.x, a.y);
  for (let i = 1; i <= 3; i++) await touch("touchMove", a.x + 4 * i, a.y + 4 * i);
  const b = dropPoint((await target().boundingBox())!);
  for (let i = 1; i <= 8; i++) await touch("touchMove", a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8);
  await followTarget(page, target, (x, y) => touch("touchMove", x, y));
  await touch("touchEnd");
  await cdp.detach();
}

type Draft = { pages: { name: string; columns: { widgets: { type: string; title?: string; widgets?: { title?: string; type: string }[]; groups?: { title?: string; links?: { title: string }[] }[] }[] }[] }[]; "glance-editor"?: { background?: { images?: { name?: string }[] } } };
async function draft(page: Page, url: string): Promise<Draft> {
  return (await (await page.request.get(`${url}/api/state`)).json()).draft as Draft;
}
const bookmarks = (d: Draft, title: string) => d.pages.flatMap((p) => p.columns.flatMap((c) => c.widgets)).find((w) => w.type === "bookmarks" && w.title === title)!;
const linksOf = (d: Draft, title: string) => (bookmarks(d, title).groups ?? []).map((g) => [g.title, (g.links ?? []).map((l) => l.title)]);

test.describe("Moving bookmarks (ADR-0031)", () => {
  test.use({ opts: { seed: fixture("moves.yml"), glance: true, assets: true } });

  test("a link to another group and to another Bookmarks widget; a whole group; Undo; Move to…", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    await openCard(page, "Work");
    const ins = inspector(page);
    const linkRow = (name: string) => ins.locator(".blink", { has: page.getByRole("button", { name: `Move ${name}`, exact: true }) });

    // Held near the panel's bottom edge, a dragged link scrolls the panel along; Escape cancels and nothing moves.
    if (!isPhone(page)) {
      const body = ins; // the panel scrolls (.ins: overflow auto)
      const g = (await ins.getByRole("button", { name: "Move Alpha", exact: true }).boundingBox())!;
      await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
      await page.mouse.down();
      await page.mouse.move(g.x + g.width / 2 + 10, g.y + g.height / 2 + 10, { steps: 2 });
      await page.mouse.move(g.x + g.width / 2, page.viewportSize()!.height - 8, { steps: 4 });
      await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await expect.poll(async () => linksOf(await draft(page, editor.url), "Work")).toEqual([["Tools", ["Alpha", "Beta"]], ["Docs", ["Gamma"]]]);
      await body.evaluate((el) => (el.scrollTop = 0));
    }
    // The rest in a tall window, so what's dragged and where it goes are both on screen.
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 1600 });

    // Within the widget: Alpha before Gamma, into the other group. A finger on a phone, the mouse on a desktop.
    const drag = isPhone(page) ? touchDrag : mouseDrag;
    await drag(page, ins.getByRole("button", { name: "Move Alpha", exact: true }), () => linkRow("Gamma"));
    await expect.poll(async () => linksOf(await draft(page, editor.url), "Work")).toEqual([["Tools", ["Beta"]], ["Docs", ["Alpha", "Gamma"]]]);

    if (!isPhone(page)) {
      // Onto another Bookmarks widget's card in the layout: the end of its first group, with Undo.
      await mouseDrag(page, ins.getByRole("button", { name: "Move Beta", exact: true }), () => card(page, "Home links"));
      await expect(page.getByText("Moved Beta to Home › Column 2 › Home links")).toBeVisible();
      await expect.poll(async () => linksOf(await draft(page, editor.url), "Home links")).toEqual([["Family", ["Delta", "Beta"]]]);
      await page.getByRole("button", { name: "Undo" }).click();
      await expect.poll(async () => linksOf(await draft(page, editor.url), "Work")).toEqual([["Tools", ["Beta"]], ["Docs", ["Alpha", "Gamma"]]]);
      // A whole group onto the other widget.
      await mouseDrag(page, ins.getByRole("button", { name: "Move group Tools", exact: true }), () => card(page, "Home links"));
      await expect.poll(async () => linksOf(await draft(page, editor.url), "Home links")).toEqual([["Family", ["Delta"]], ["Tools", ["Beta"]]]);
      await expect.poll(async () => linksOf(await draft(page, editor.url), "Work")).toEqual([["Docs", ["Alpha", "Gamma"]]]);
    }

    // Move to…: the grip, pressed from the keyboard (or tapped), lists every group of every Bookmarks widget.
    await ins.getByRole("button", { name: "Move Gamma", exact: true }).focus();
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog", { name: "Move to" });
    await expect(sheet.getByRole("heading", { name: "Move Gamma to…" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /^This widget › Docs/ })).toBeDisabled(); // where it is now
    await expectAccessible(page, "move to");
    await expectTargets(page, "move to");
    await shot(page, "move-to", { fullPage: false });
    await sheet.getByRole("button", { name: /^Home › Column 2 › Home links › Family/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Moved Gamma to Family")).toBeVisible();
    await expect.poll(async () => linksOf(await draft(page, editor.url), "Home links")).toContainEqual(["Family", ["Delta", "Gamma"]]);
    await expectAccessible(page, "bookmarks with grips");
    await expectTargets(page, "bookmarks with grips");
    await shot(page, "bookmarks-grips", { fullPage: false });
  });
});

test.describe("Moving widgets (ADR-0031)", () => {
  test.use({ opts: { seed: fixture("moves.yml"), glance: true, assets: true } });

  test("into a group by its Into strip and out again; Move to… another page, with Undo", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    const groupKids = async () => (await draft(page, editor.url)).pages[0]!.columns[1]!.widgets[0]!.widgets!.map((w) => w.title ?? w.type);
    if (!isPhone(page)) {
      // Into the group: its card shows an "Into" strip while another widget is dragged.
      await mouseDrag(page, card(page, "Clock").getByRole("button", { name: "Move Clock" }), () => page.locator(".intostrip", { hasText: "Into Group" }));
      await expect.poll(groupKids).toEqual(["News", "clock"]);
      // Out again, from the group's settings onto the end of column 1.
      await openCard(page, "Group");
      await mouseDrag(page, inspector(page).getByRole("button", { name: "Move Clock", exact: true }),
        () => page.locator('[data-drop-end][data-drop-list$="|0|"]'));
      await expect.poll(groupKids).toEqual(["News"]);
      await expect.poll(async () => (await draft(page, editor.url)).pages[0]!.columns[0]!.widgets.map((w) => w.type)).toEqual(["bookmarks", "clock"]);
      await inspector(page).getByRole("button", { name: "Close settings" }).click();
    }
    // Move to…: the card's move buttons list every place, on every page.
    await card(page, "Clock").getByRole("button", { name: "Move Clock" }).click();
    await card(page, "Clock").getByRole("button", { name: "Move to…" }).click();
    const sheet = page.getByRole("dialog", { name: "Move to" });
    await expect(sheet.getByRole("button", { name: /^Home › Column 2 › Group/ })).toBeVisible();
    await sheet.getByRole("button", { name: /^Ops › Column 1/ }).click();
    await expect(page.getByText("Moved Clock to Ops › Column 1")).toBeVisible();
    await expect.poll(async () => (await draft(page, editor.url)).pages[1]!.columns[0]!.widgets.map((w) => w.type)).toEqual(["to-do", "clock"]);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(async () => (await draft(page, editor.url)).pages[1]!.columns[0]!.widgets.map((w) => w.type)).toEqual(["to-do"]);
    if (isPhone(page)) {
      // A finger on a card's grip drags it too (the page doesn't scroll from the grip): into the group.
      await page.setViewportSize({ width: page.viewportSize()!.width, height: 1600 });
      await touchDrag(page, card(page, "Clock").getByRole("button", { name: "Move Clock" }), () => page.locator(".intostrip", { hasText: "Into Group" }));
      await expect.poll(groupKids).toEqual(["News", "clock"]);
    }
  });
});

test.describe("Moving pages and slides (ADR-0031)", () => {
  test.use({ opts: { seed: fixture("moves.yml"), glance: true, assets: true } });

  test("a page in the rail (desktop); slides by their grip (mouse, or a finger on a phone)", async ({ page, editor }) => {
    await importSeed(page, editor.url);
    if (!isPhone(page)) {
      const rail = page.getByRole("navigation", { name: "Editor" });
      await mouseDrag(page, rail.getByRole("button", { name: "Move page Ops" }), () => rail.locator(".navrow").first());
      await expect.poll(async () => (await draft(page, editor.url)).pages.map((p) => p.name)).toEqual(["Ops", "Home"]);
      // A tap on the grip shows move buttons (keyboard, or anyone who prefers them).
      await rail.getByRole("button", { name: "Move page Home" }).click();
      await rail.getByRole("group", { name: "Move page Home" }).getByRole("button", { name: "Move page up" }).click();
      await expect.poll(async () => (await draft(page, editor.url)).pages.map((p) => p.name)).toEqual(["Home", "Ops"]);
      await expectAccessible(page, "rail with grips");
      await expectTargets(page, "rail with grips");
      await shot(page, "rail-grips", { fullPage: false });
    }
    await (isPhone(page) ? page.getByRole("navigation", { name: "Sections" }) : page.getByRole("navigation", { name: "Editor" })).getByRole("button", { name: /^Theme/ }).click();
    const slide = (name: string) => page.locator(".crow", { has: page.getByRole("button", { name: `Move ${name}`, exact: true }) });
    await slide("three.png").scrollIntoViewIfNeeded();
    await (isPhone(page) ? touchDrag : mouseDrag)(page, page.getByRole("button", { name: "Move three.png", exact: true }), () => slide("one.png"));
    await expect.poll(async () => (await draft(page, editor.url))["glance-editor"]!.background!.images!.map((i) => i.name)).toEqual(["three.png", "one.png", "two.png"]);
  });
});
