// ADR-0036: the links the editor warns about (glanceDropsLink) are exactly the title links the pinned Glance turns into
// dead links ("#ZgotmplZ"), checked on the page the real Glance serves.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GLANCE_VERSION, glanceDropsLink, type DashboardT } from "@glance-editor/model";
import { generate } from "@glance-editor/generator";
import { startGlance, type RunningGlance } from "./server.ts";

const LINKS = [
  "https://example.com/a", "HTTP://example.com", "mailto:a@example.com", "/assets/x", "page", "a/b:c",
  "smb://nas/share", "localhost:8080", "javascript:void(0)", "tel:123", "vnc://host:5900",
];

let glance: RunningGlance;

beforeAll(async () => {
  glance = await startGlance(
    (port) => {
      const d: DashboardT = {
        schemaVersion: 2,
        server: { host: "127.0.0.1", port },
        pages: [{
          _id: "p", name: "P", slug: "p",
          columns: [{ _id: "c", size: "full", widgets: LINKS.map((url, i) => ({ _id: `w${i}`, type: "clock" as const, title: `L${i}`, "title-url": url })) }],
        }],
      };
      return generate(d, { glanceVersion: GLANCE_VERSION }).yaml;
    },
    {},
  );
});

afterAll(() => glance?.stop());

describe(`title links as Glance ${GLANCE_VERSION} writes them`, () => {
  it.each(LINKS.map((url, i) => [url, i] as const))("%j", async (url, i) => {
    const html = await fetch(`${glance.url}/api/pages/p/content/`).then((r) => r.text());
    const href = new RegExp(`<a href="([^"]*)"[^>]*>L${i}</a>`).exec(html)?.[1];
    expect(href, `no title link for ${url}`).toBeDefined();
    expect(href === "#ZgotmplZ").toBe(glanceDropsLink(url));
  });
});
