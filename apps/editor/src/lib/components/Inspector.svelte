<!-- Widget inspector (design D-04, D-05, D-11 to D-14): a panel on the right on desktop, full screen on a phone.
     Settings: the form generated from the widget's schema, the Children section for groups and split columns (one level
     at a time, with a Back link), the Bookmarks and Containers sections. YAML: what will be written for this widget; applying a change
     makes it a YAML override and the form goes read-only until the override is discarded (D-12). One with no form behind
     it (a community widget) shows its title, cache and values instead (ADR-0030). -->
<script lang="ts">
  import { tick, untrack } from "svelte";
  import { GLANCE_VERSION, WIDGETS, isRawWidget, type ModelWidgetT, type WidgetT } from "@glance-editor/model";
  import {
    canMove, cantMoveInto, childRef, formEntries, listLabel, moveWidget, moveWidgetToList, parentOf, setIn, typeLabel, widgetAt,
    widgetDestinations, widgetName, type ListRef, type WidgetRef,
  } from "@glance-editor/editing";
  import { gripDrag, listKey, parseListKey } from "../client/drag.ts";
  import { api } from "../client/api.ts";
  import type { App } from "../client/app.svelte.ts";
  import Bookmarks from "./Bookmarks.svelte";
  import Containers from "./Containers.svelte";
  import Field from "./Field.svelte";
  import Icon from "./Icon.svelte";
  import YamlWidgetSettings from "./YamlWidgetSettings.svelte";

  let { app, wref }: { app: App; wref: WidgetRef } = $props();

  const w = $derived(widgetAt(app.draft!, wref)!);
  const schema = $derived(WIDGETS[w.type]);
  const raw = $derived(isRawWidget(w));
  const override = $derived(!!w._yaml);
  // ADR-0030: kept as YAML with no form behind it (added from the community widgets): discarding the override would
  // leave an empty widget, so its settings are its title, cache and values instead.
  const yamlOnly = $derived.by(() => {
    if (!w._yaml) return false;
    try { return Object.keys(JSON.parse(w._yaml.form) as object).every((k) => k === "_id" || k === "type"); } catch { return false; }
  });
  const name = $derived(widgetName(w, typeLabel(w.type)));
  const crumb = $derived(listLabel(app.draft!, parentOf(wref)));
  const parentRef = $derived(wref.ids.length > 1 ? { ...wref, ids: wref.ids.slice(0, -1) } : null);
  const parent = $derived(parentRef ? widgetAt(app.draft!, parentRef) : undefined);
  const children = $derived(((w as ModelWidgetT).widgets ?? []) as WidgetT[]);
  const tab = $derived(app.insTab);
  const errIds = $derived(new Set(app.showErrors ? app.errors.flatMap((p) => p.location.widgetIds ?? []) : []));

  // ADR-0031: a child moves by its grip: dragged within the list or out onto the layout, or (a tap) Move to….
  const kidsList = $derived<ListRef>({ ...parentOf(wref), parentIds: wref.ids });
  const kidsKey = $derived(listKey(kidsList));
  const moveChild = (cref: WidgetRef, to: ListRef, at: number, toast?: string) =>
    app.mutate((d) => moveWidgetToList(d, cref, to, at), toast ? { toast, undo: true } : {});
  const childMoveTo = (cref: WidgetRef, cname: string) => (app.sheet = {
    kind: "moveTo", what: cname,
    options: widgetDestinations(app.draft!, cref).map((x) => ({ label: x.label, go: () => moveChild(cref, x.to, Number.MAX_SAFE_INTEGER, `Moved ${cname} to ${x.label}`) })),
  });

  const set = (path: (string | number)[], value: unknown, opts: { toast?: string; undo?: boolean } = {}) =>
    app.editWidget(wref, (x) => setIn(x as Record<string, unknown>, path, value), opts);
  // Problems from the last save attempt at a path inside this widget (D-28): shown under the field.
  const problemsAt = (path: (string | number)[]) =>
    app.showErrors
      ? app.errors.filter((p) => p.source === "editor" && p.code !== "field.invalid" && p.location.widgetIds?.join("/") === wref.ids.join("/") &&
          (p.location.path ?? [p.location.field]).join(".") === path.join(".")).map((p) => p.message)
      : [];

  // ---- YAML tab -----------------------------------------------------------------------------------------------------
  let yamlText = $state<string | null>(null); // what will be written (from the server)
  let yamlDraft = $state<string | null>(null); // the user's edit, not applied yet
  let yamlError = $state<string | null>(null);
  let yamlNotes = $state<string[]>([]);
  let yamlLoading = $state(false);
  async function loadYaml() {
    yamlLoading = true;
    yamlError = null;
    try {
      await app.settle();
      yamlText = (await api.widgetText(w._id)).text;
    } catch (e) {
      yamlError = `Couldn't load this widget's YAML: ${(e as Error).message}`;
    } finally {
      yamlLoading = false;
    }
  }
  // Reload whenever the YAML tab is shown, or another widget is opened in it (not on every edit of the draft).
  const wid = $derived(w._id);
  $effect(() => {
    if (tab !== "yaml") return;
    void wid;
    yamlDraft = null;
    yamlNotes = [];
    void loadYaml();
  });
  async function applyYaml() {
    const text = yamlDraft;
    if (text === null) return;
    yamlError = null;
    const r = await api.parseWidget(text, w._id).catch((e: Error) => ({ ok: false as const, message: e.message, line: null }));
    if (!r.ok) {
      yamlError = r.line ? `Line ${r.line}: ${r.message}` : r.message;
      return;
    }
    const before = $state.snapshot(w) as WidgetT;
    const form = before._yaml ? before._yaml.form : JSON.stringify(before);
    app.editWidget(wref, (x) => {
      for (const k of Object.keys(x)) delete (x as Record<string, unknown>)[k];
      Object.assign(x, r.widget, { _yaml: { text, form } });
    });
    yamlText = text;
    yamlDraft = null;
    yamlNotes = r.notes;
    app.say("YAML applied to the draft");
  }
  function discardOverride() {
    const form = w._yaml?.form;
    if (!form) return;
    app.editWidget(wref, (x) => {
      for (const k of Object.keys(x)) delete (x as Record<string, unknown>)[k];
      Object.assign(x, JSON.parse(form) as WidgetT);
    }, { toast: "YAML override discarded" });
  }

  // Focus moves into the inspector when it opens on another widget (keyboard, phone), unless Go to points at a field.
  let heading = $state<HTMLElement>();
  const refKey = $derived(wref.ids.join("/"));
  $effect(() => {
    void refKey;
    const goTo = untrack(() => app.highlight?.widgetIds?.join("/") === refKey && (app.highlight.path || app.highlight.field));
    if (!goTo) void tick().then(() => heading?.focus({ preventScroll: true }));
  });
</script>

<aside class="ins" aria-label="Widget settings">
  <div class="inshead">
    <button type="button" class="ib phone-only" aria-label="Back to layout" onclick={() => app.closeInspector()}><Icon name="back" size={20} /></button>
    <div class="grow"><p class="crumb">{crumb}</p><h2 class="h2" tabindex="-1" bind:this={heading}>{name}</h2><span class="tlabel">{schema?.label ?? w.type}</span></div>
    <button type="button" class="ib desk-only" aria-label="Close settings" onclick={() => app.closeInspector()}><Icon name="close" size={20} /></button>
  </div>
  <div class="insbody">
    <div class="seg" role="tablist" aria-label="Edit mode" style="align-self: flex-start; margin-bottom: 8px">
      <button type="button" role="tab" id="tab-settings" aria-controls="panel-settings" class:on={tab === "settings"} aria-selected={tab === "settings"}
        onclick={() => (app.insTab = "settings")}>Settings</button>
      <button type="button" role="tab" id="tab-yaml" aria-controls="panel-yaml" class:on={tab === "yaml"} aria-selected={tab === "yaml"}
        onclick={() => (app.insTab = "yaml")}>YAML</button>
    </div>
    {#if parentRef && parent}
      <button type="button" class="btn ghost" style="align-self: flex-start; padding: 0 8px" onclick={() => app.select(parentRef)}>
        <Icon name="back" />Back to {widgetName(parent, typeLabel(parent.type))}</button>
    {/if}

    {#if tab === "settings"}
      <div id="panel-settings" role="tabpanel" aria-labelledby="tab-settings" class="stack" style="gap: 4px">
        {#if raw}
          <div class="notice">Glance {GLANCE_VERSION} has no widget type “{w.type}”. The widget is kept exactly as written; edit it in the YAML tab.
            <button type="button" class="btn" onclick={() => (app.insTab = "yaml")}>Open YAML</button></div>
        {:else}
          {#if yamlOnly}
            <div class="notice" role="note"><span><strong>Community widgets are in early alpha:</strong> this one may need a change in its YAML, or in its service's settings, before it works.</span>
              <span>This widget is kept as YAML. Its title, cache and values are here; everything else is in the YAML tab.</span></div>
            <YamlWidgetSettings {app} {wref} {w} />
          {:else if override}
            <div class="notice">This widget is edited as YAML, so the form is read-only. Discarding the override returns it to the form values.
              <button type="button" class="btn" onclick={discardOverride}>Discard YAML override</button></div>
          {/if}
          {#if !yamlOnly}
          <fieldset disabled={override}>
            <legend class="sr">Widget properties</legend>
            {#each formEntries(w.type) as e (e.kind === "field" ? e.field.key : e.label)}
              {#if e.kind === "note"}
                <div class="field"><span class="flabel">{e.label}</span><p class="help" style="margin: 0">{e.text}</p></div>
              {:else}
                <Field {app} {wref} field={e.field} value={(w as Record<string, unknown>)[e.field.key]} path={[e.field.key]} disabled={override} {set} {problemsAt} />
              {/if}
            {/each}
          </fieldset>
          {/if}

          {#if schema?.container}
            {@const isGroup = w.type === "group"}
            <div class="rule"><span class="lbl">{isGroup ? "Tabs" : "Widgets"}</span></div>
            <p class="help" style="margin: 0 0 6px">{isGroup ? "Each widget is a tab. A group can’t contain a group or a split column." : "Widgets sit side by side. A split column can contain groups."}</p>
            <div class="stack" style="gap: 6px">
              {#each children as c, i (c._id)}
                {@const cref = childRef({ ...parentOf(wref), parentIds: wref.ids }, c._id)}
                {@const cname = widgetName(c, typeLabel(c.type))}
                <div class="crow" class:dragging={app.drag?.kind === "widget" && app.drag.id === c._id} style="padding-left: 4px"
                  class:dropbefore={app.drag?.kind === "widget" && app.drag.target?.list === kidsKey && app.drag.target.index === i && app.drag.id !== c._id}
                  data-drop-for="widget" data-drop-list={kidsKey} data-drop-index={i}>
                  <button type="button" class="grip" aria-label={`Move ${cname}`} title="Drag to move, or tap for Move to…" disabled={override}
                    use:gripDrag={{ app, kind: "widget", id: c._id,
                      accept: (k) => { const l = parseListKey(k); return !!l && !cantMoveInto(app.draft!, cref, l); },
                      onDrop: (t) => { const l = parseListKey(t.list); if (l) moveChild(cref, l, t.index); } }}
                    onclick={() => childMoveTo(cref, cname)}><Icon name="grip" size={16} /></button>
                  <button type="button" class="crowmain" aria-label={`${cname}, ${typeLabel(c.type)}. Open settings`} onclick={() => app.select(cref)}>
                    <span class="tlabel">{typeLabel(c.type)}</span><span class="wname">{cname}</span></button>
                  {#if errIds.has(c._id)}<span class="errdot">Fix</span>{/if}
                  <button type="button" class="ib sm" aria-label={`Move ${cname} up`} disabled={override || !canMove(app.draft!, cref, -1)} onclick={() => app.mutate((d) => moveWidget(d, cref, -1))}><Icon name="up" /></button>
                  <button type="button" class="ib sm" aria-label={`Move ${cname} down`} disabled={override || !canMove(app.draft!, cref, 1)} onclick={() => app.mutate((d) => moveWidget(d, cref, 1))}><Icon name="down" /></button>
                  <button type="button" class="ib sm" aria-label={`Delete ${cname}`} disabled={override} onclick={() => app.deleteWidgetAt(cref)}><Icon name="trash" /></button>
                </div>
              {/each}
              {#if app.drag?.kind === "widget"}
                <div class="dropzone show" class:on={app.drag.target?.list === kidsKey && app.drag.target.index === children.length}
                  data-drop-for="widget" data-drop-list={kidsKey} data-drop-end={children.length} aria-hidden="true"></div>
              {/if}
              {#if !children.length}<div class="empty">{isGroup ? "No tabs yet." : "No widgets yet."}</div>{/if}
              <button type="button" class="btn add" disabled={override}
                onclick={() => (app.sheet = { kind: "add", target: { ...parentOf(wref), parentIds: wref.ids } })}><Icon name="plus" />{isGroup ? "Add tab" : "Add widget"}</button>
            </div>
          {/if}

          {#if schema?.section === "bookmarks"}
            <Bookmarks {app} {wref} w={w as ModelWidgetT} disabled={override} />
          {:else if schema?.section === "containers"}
            <Containers {app} {wref} w={w as ModelWidgetT} disabled={override} />
          {/if}
        {/if}
      </div>
    {:else}
      <div id="panel-yaml" role="tabpanel" aria-labelledby="tab-yaml" class="stack" style="gap: 8px">
        <label class="flabel" for="yaml" style="margin: 0">YAML for this widget</label>
        {#if yamlLoading && yamlText === null}
          <p class="note pulse">Loading…</p>
        {:else}
          <textarea id="yaml" class="input code" spellcheck="false" value={yamlDraft ?? yamlText ?? ""} aria-invalid={!!yamlError}
            aria-describedby={yamlError ? "yaml-err" : undefined} oninput={(e) => { yamlDraft = e.currentTarget.value; yamlError = null; }}></textarea>
        {/if}
        {#if yamlError}<p class="errtxt" id="yaml-err" style="margin: 0">{yamlError}</p>{/if}
        <div class="row wrap">
          <button type="button" class="btn pri" disabled={yamlDraft === null || yamlDraft === yamlText} onclick={applyYaml}>Apply YAML</button>
          <button type="button" class="btn ghost" disabled={yamlDraft === null} onclick={() => { yamlDraft = null; yamlError = null; }}>Revert</button>
        </div>
        {#each yamlNotes as n, i (i)}<p class="help" style="margin: 0">{n}</p>{/each}
        <p class="help">Apply switches this widget to a YAML override; the form goes read-only for it. {"${NAME}"} references stay as text. Glance's own validator checks the result when you save.</p>
      </div>
    {/if}
  </div>
  <div class="insfoot"><button type="button" class="btn warn" onclick={() => app.deleteWidgetAt(wref)}>Delete widget</button></div>
</aside>
