// The Containers section's rules (D-22 to D-24) against Glance v0.8.8's (widget-docker-containers.go; test/glance-docker.sh).
// Property: whatever the widget and the container's labels, pressing the eye gives the outcome asked for, and
// touches nothing but that container's `hide`.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { containerRows, setContainerVisible, type ContainerEntry, type ContainerInfo } from "../src/containers.ts";

const c = (name: string, state = "running", glance: Record<string, string> = {}): ContainerInfo => ({ name, state, glance });
const row = (w: object, list: ContainerInfo[] | null, name: string) => containerRows(w, list).rows.find((r) => r.name === name)!;

describe("containerRows", () => {
  const list = [c("paperless"), c("watchtower", "running", { hide: "true" }), c("old-nextcloud", "exited"), c("jellyfin")];

  it("shows everything by default, sorted by name, with the count Glance would list", () => {
    const r = containerRows({}, list);
    expect(r.rows.map((x) => x.name)).toEqual(["jellyfin", "old-nextcloud", "paperless", "watchtower"]);
    expect(r.shown).toBe(3); // watchtower is hidden by its label
    expect(row({}, list, "old-nextcloud").sub).toBe("Stopped");
  });

  it("D-23: a container hidden by its glance.hide label is read-only, tagged by its label", () => {
    const r = row({}, list, "watchtower");
    expect(r).toMatchObject({ visible: false, locked: true });
    expect(r.sub).toMatch(/glance\.hide label/);
  });

  it("Glance's map wins over the label; the row says so and stays read-only", () => {
    const w = { containers: [{ _id: "a", container: "watchtower", hide: false }] };
    expect(row(w, list, "watchtower")).toMatchObject({ visible: true, shown: true, locked: true });
    expect(row(w, list, "watchtower").sub).toMatch(/overrides/);
  });

  it("only \"true\" and \"yes\" hide (Glance's stringToBool); another value shows, even with Hide by default", () => {
    const l = [c("a", "running", { hide: "yes" }), c("b", "running", { hide: "1" }), c("d", "running", { hide: "false" })];
    const w = { "hide-by-default": true };
    expect(containerRows(w, l).rows.map((x) => x.visible)).toEqual([false, true, true]);
  });

  it("Hide by default: only containers switched on are shown", () => {
    const w = { "hide-by-default": true, containers: [{ _id: "a", container: "jellyfin", hide: false }] };
    const r = containerRows(w, list);
    expect(r.rows.filter((x) => x.visible).map((x) => x.name)).toEqual(["jellyfin"]);
    expect(r.shown).toBe(1);
  });

  it("Running only leaves stopped containers out, but not paused ones (Docker's all=false returns them)", () => {
    const l = [c("p", "paused"), c("s", "exited")];
    const r = containerRows({ "running-only": true }, l);
    expect(r.rows.map((x) => [x.shown, x.sub])).toEqual([[true, "Paused"], [false, "Stopped · not shown while Running only is on"]]);
  });

  it("Category keeps only that category; the map can set a container's category", () => {
    const l = [c("a", "running", { category: "media" }), c("b"), c("d", "running", { category: "media" })];
    const w = { category: "media", containers: [{ _id: "x", container: "b", category: "media" }, { _id: "y", container: "d", category: "" }] };
    expect(containerRows(w, l).rows.map((x) => x.shown)).toEqual([true, true, false]);
  });

  it("v0.8.8: a child (glance.parent, no glance.id) is shown under its parent, whatever the widget's category", () => {
    const l = [
      c("immich", "running", { id: "im", category: "media", name: "Immich" }), c("immich-db", "running", { parent: "im" }),
      c("other", "running", { id: "ot" }), c("other-db", "running", { parent: "ot" }), c("orphan", "running", { parent: "none" }),
    ];
    const r = containerRows({ category: "media" }, l);
    expect(r.rows.map((x) => [x.name, x.shown])).toEqual([["immich", true], ["immich-db", true], ["orphan", false], ["other", false], ["other-db", false]]);
    expect(row({ category: "media" }, l, "immich-db").sub).toBe("Running · shown under “Immich”");
    expect(row({ category: "media" }, l, "other-db").sub).toBe("Not shown: Glance lists it under “other”, which isn’t shown");
    expect(row({}, l, "orphan").sub).toBe("Not shown: Glance lists it under the container with glance.id “none”, and there is none");
    expect(r.shown).toBe(2);
  });

  it("a child follows the hide rules and Running only itself; a container with glance.id is never a child; the map sets both", () => {
    const l = [c("app", "running", { id: "a" }), c("db", "exited", { parent: "a" }), c("cache", "running", { parent: "a", hide: "true" }), c("both", "running", { id: "b", parent: "a", category: "x" })];
    expect(containerRows({ "running-only": true }, l).rows.map((x) => [x.name, x.shown])).toEqual([["app", true], ["both", true], ["cache", false], ["db", false]]);
    expect(row({ category: "y" }, l, "both").sub).toMatch(/only the category/);
    const w = { containers: [{ _id: "y", container: "app", id: "" }, { _id: "z", container: "both", parent: "" }] };
    expect(row(w, l, "db").sub).toBe("Not shown: Glance lists it under the container with glance.id “a”, and there is none");
    expect(row(w, l, "app")).toMatchObject({ shown: true, sub: "Running" });
  });

  it("names in the map that Docker doesn't report are listed; all of them when Docker can't be reached", () => {
    const w = { containers: [{ _id: "a", container: "gone", hide: true }, { _id: "b", container: "jellyfin", hide: true }] };
    expect(row(w, list, "gone")).toMatchObject({ state: null, visible: false, shown: false });
    expect(row(w, list, "gone").sub).toMatch(/no container with this name/);
    const off = containerRows(w, null);
    expect(off.rows.map((x) => x.name)).toEqual(["gone", "jellyfin"]);
    expect(off.rows[0]!.sub).toBe("State unknown · hidden");
    expect(off.shown).toBe(0);
  });
});

describe("setContainerVisible", () => {
  it("prototype behaviour: hiding writes hide: true; showing again removes the entry", () => {
    const w: { containers?: ContainerEntry[] } = {};
    setContainerVisible(w, "paperless", false, c("paperless"));
    expect(w.containers).toMatchObject([{ container: "paperless", hide: true }]);
    setContainerVisible(w, "paperless", true, c("paperless"));
    expect(w.containers).toBeUndefined();
  });

  it("Hide by default flips what the toggle writes (D-24)", () => {
    const w: { "hide-by-default": boolean; containers?: ContainerEntry[] } = { "hide-by-default": true };
    setContainerVisible(w, "jellyfin", true, c("jellyfin"));
    expect(w.containers).toMatchObject([{ container: "jellyfin", hide: false }]);
    setContainerVisible(w, "jellyfin", false, c("jellyfin"));
    expect(w.containers).toBeUndefined();
  });

  it("keeps the entry's other keys and the other entries", () => {
    const w = { containers: [{ _id: "a", container: "jellyfin", name: "Jellyfin", icon: "si:jellyfin" }, { _id: "b", container: "x", hide: true }] };
    setContainerVisible(w, "jellyfin", false, c("jellyfin"));
    expect(w.containers).toEqual([{ _id: "a", container: "jellyfin", name: "Jellyfin", icon: "si:jellyfin", hide: true }, { _id: "b", container: "x", hide: true }]);
    setContainerVisible(w, "jellyfin", true, c("jellyfin"));
    expect(w.containers[0]).toEqual({ _id: "a", container: "jellyfin", name: "Jellyfin", icon: "si:jellyfin" });
  });

  it("without the container's labels (Docker not reached) it always writes hide", () => {
    const w: { containers?: ContainerEntry[] } = { containers: [{ _id: "a", container: "x", hide: true }] };
    setContainerVisible(w, "x", true, null);
    expect(w.containers).toMatchObject([{ container: "x", hide: false }]);
  });

  it("property: the row shows the outcome asked for, and nothing else changes", () => {
    const labelHide = fc.constantFrom(undefined, "true", "yes", "false", "1", "");
    const entry = fc.record({ hide: fc.option(fc.boolean(), { nil: undefined }), name: fc.option(fc.constant("N"), { nil: undefined }) });
    fc.assert(fc.property(fc.boolean(), labelHide, fc.option(entry, { nil: undefined }), fc.boolean(), fc.boolean(), (hbd, lh, e, known, visible) => {
      const info = c("t", "running", lh === undefined ? {} : { hide: lh });
      const other = { _id: "o", container: "other", hide: true };
      const start = e ? [{ _id: "e", container: "t", ...Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)) }, other] : [other];
      const w: { "hide-by-default": boolean; containers?: ContainerEntry[] } = { "hide-by-default": hbd, containers: structuredClone(start) };
      if (row(w, [info], "t").locked) return; // D-23: no toggle offered
      setContainerVisible(w, "t", visible, known ? info : null);
      expect(row(w, [info], "t").visible).toBe(visible);
      expect(w.containers?.find((x) => x.container === "other")).toEqual(other);
      const after = w.containers?.find((x) => x.container === "t");
      if (e?.name) expect(after?.name).toBe("N");
    }), { numRuns: 500 });
  });
});
