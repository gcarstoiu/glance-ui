// Widget schemas for Glance v0.8.6 (design handoff §3; ADR-0017).
//
// Sources, all read 2026-10-13 at the pinned commit (glance.version):
//   - keys: the widget structs in `internal/glance/widget-*.go` (yaml tags), `pkg/sysinfo/sysinfo.go`
//   - required fields, strict enums and defaults: each widget's `initialize()`
//   - refresh (D-58): `withCacheDuration` / `withCacheOnTheHour` calls in `initialize()`, `widget.go` withCacheDuration
//   - labels and categories: the design prototype's TYPES list; help text: `docs/configuration.md` at v0.8.6
// `required`, `strict` and every key are checked against the real binary by packages/glance/test/widget-schema.test.ts.

import type { Field } from "./fields.ts";

export type WidgetCategory = "Feeds" | "Tools" | "Info" | "Server" | "Dev" | "Layout" | "Advanced";

/** D-58: what the shared `cache` key does for this type. */
export type Refresh =
  /** Glance refetches after `default`; `cache` overrides it. */
  | { kind: "interval"; default: string }
  /** Glance refetches on the hour; `cache` is ignored. */
  | { kind: "hourly" }
  /** Nothing is fetched (or nothing is refreshed); `cache` is ignored. */
  | { kind: "none" };

export interface WidgetSchema {
  type: string;
  label: string;
  category: WidgetCategory;
  /** Another name Glance accepts for the same widget. Not offered in Add widget. */
  aliasOf?: string;
  container?: true;
  disallowedChildren?: readonly string[];
  /** Edited in a dedicated section instead of a form field (D-13). */
  section?: "bookmarks" | "containers";
  refresh: Refresh;
  /** Type-specific fields. The shared fields (`COMMON_FIELDS`) come first. */
  fields: Field[];
}

// ---- shared ------------------------------------------------------------------------------------------------------

// widget.go widgetBase. The prototype's Settings tab shows Title (and Refresh); the rest are YAML-tab only.
export const COMMON_FIELDS: Field[] = [
  { key: "title", label: "Title", kind: "text", help: "Shown in the widget header." },
  { key: "title-url", label: "Title link", kind: "url", hidden: true },
  { key: "hide-header", label: "Hide header", kind: "bool", hidden: true },
  { key: "css-class", label: "CSS class", kind: "text", hidden: true },
  {
    key: "cache", label: "Refresh data every", kind: "duration",
    help: "How long Glance keeps the data this widget fetched before fetching it again. Empty uses Glance's default for this widget.",
  },
];

const HOUR_FORMAT = (def: "12h" | "24h", strict: boolean): Field => ({
  key: "hour-format", label: "Hour format", kind: "enum", options: ["12h", "24h"], default: def, ...(strict ? { strict: true } : {}),
});
const limit = (def: number, label = "Item limit"): Field => ({ key: "limit", label, kind: "number", integer: true, default: def });
const collapseAfter = (def: number): Field => ({
  key: "collapse-after", label: "Collapse after", kind: "number", integer: true, default: def,
  help: "How many items are visible before the rest are hidden behind “Show more”. -1 never collapses.",
});
const ENGAGEMENT: Field = {
  key: "extra-sort-by", label: "Extra sort", kind: "enum", options: ["engagement"],
  help: "Engagement puts posts with the most points and comments first, preferring recent posts.",
};
const BASIC_AUTH: Field = {
  key: "basic-auth", label: "Basic auth", kind: "object",
  item: [
    { key: "username", label: "Username", kind: "text" },
    { key: "password", label: "Password", kind: "text" },
  ],
};
const HEADERS: Field = { key: "headers", label: "Headers", kind: "map", wrongType: ["x"] };
const PARAMETERS: Field = {
  key: "parameters", label: "Query parameters", kind: "yaml", sample: { a: "b" }, wrongType: ["x"],
  help: "Key and value pairs added to the URL. A value can be a list.",
};

// widget-custom-api.go CustomAPIRequest
const API_REQUEST: Field[] = [
  { key: "url", label: "URL", kind: "url", sample: "https://example.com/api" },
  HEADERS,
  PARAMETERS,
  { key: "method", label: "Method", kind: "text", default: "GET" },
  {
    key: "body-type", label: "Body type", kind: "enum", options: ["json", "string"], default: "json", strict: true,
    help: "Only used when a body is set.",
  },
  { key: "body", label: "Body", kind: "yaml", sample: "x" },
  { key: "allow-insecure", label: "Allow invalid certificates", kind: "bool" },
  { key: "skip-json-validation", label: "Skip JSON validation", kind: "bool" },
  BASIC_AUTH,
];

const MARKET_ITEM: Field[] = [
  { key: "symbol", label: "Symbol", kind: "text", docsRequired: true },
  { key: "name", label: "Name", kind: "text" },
  { key: "symbol-link", label: "Symbol link", kind: "url" },
  { key: "chart-link", label: "Chart link", kind: "url" },
];

// ---- the schemas ---------------------------------------------------------------------------------------------------

const list: WidgetSchema[] = [
  // widget-rss.go
  {
    type: "rss", label: "RSS", category: "Feeds", refresh: { kind: "interval", default: "2h" },
    fields: [
      {
        key: "style", label: "Style", kind: "enum", default: "vertical-list",
        options: ["vertical-list", "detailed-list", "horizontal-cards", "horizontal-cards-2"],
        help: "Vertical list suits small and full columns; the others suit full columns.",
      },
      { key: "thumbnail-height", label: "Thumbnail height", kind: "number", default: 10 },
      { key: "card-height", label: "Card height", kind: "number", default: 27 },
      limit(25),
      { key: "preserve-order", label: "Keep feed order", kind: "bool", help: "Show items in the feeds' order instead of newest first." },
      { key: "single-line-titles", label: "Single-line titles", kind: "bool" },
      collapseAfter(5),
      {
        key: "feeds", label: "Feeds", kind: "objectList", docsRequired: true,
        item: [
          { key: "url", label: "Feed URL", kind: "url", docsRequired: true },
          { key: "title", label: "Title", kind: "text", help: "Defaults to the feed's own title." },
          { key: "hide-categories", label: "Hide categories", kind: "bool", help: "Detailed list style only." },
          { key: "hide-description", label: "Hide description", kind: "bool", help: "Detailed list style only." },
          { key: "limit", label: "Item limit", kind: "number", integer: true },
          { key: "item-link-prefix", label: "Item link prefix", kind: "text" },
          { key: "thumbnail-link-prefix", label: "Thumbnail link prefix", kind: "text" },
          HEADERS,
        ],
      },
    ],
  },
  // widget-videos.go
  {
    type: "videos", label: "Videos", category: "Feeds", refresh: { kind: "interval", default: "1h" },
    fields: [
      { key: "channels", label: "Channel IDs", kind: "list", docsRequired: true, help: "One YouTube channel ID per line." },
      { key: "playlists", label: "Playlist IDs", kind: "list" },
      limit(25),
      { key: "style", label: "Style", kind: "enum", options: ["horizontal-cards", "vertical-list", "grid-cards"], default: "horizontal-cards" },
      collapseAfter(7),
      { key: "collapse-after-rows", label: "Collapse after rows", kind: "number", integer: true, default: 4, help: "Grid cards style only." },
      { key: "include-shorts", label: "Include Shorts", kind: "bool" },
      { key: "video-url-template", label: "Video link template", kind: "text", help: "{VIDEO-ID} is replaced with the video's ID." },
    ],
  },
  // widget-hacker-news.go
  {
    type: "hacker-news", label: "Hacker News", category: "Feeds", refresh: { kind: "interval", default: "30m" },
    fields: [
      limit(15, "Post limit"),
      collapseAfter(5),
      { key: "comments-url-template", label: "Comments link template", kind: "text", help: "{POST-ID} is replaced with the post's ID." },
      { key: "sort-by", label: "Sort by", kind: "enum", options: ["top", "new", "best"], default: "top" },
      ENGAGEMENT,
    ],
  },
  // widget-lobsters.go
  {
    type: "lobsters", label: "Lobsters", category: "Feeds", refresh: { kind: "interval", default: "1h" },
    fields: [
      { key: "instance-url", label: "Instance URL", kind: "url", default: "https://lobste.rs/" },
      { key: "custom-url", label: "Custom URL", kind: "url", help: "A full URL that returns posts as JSON; overrides the instance URL." },
      limit(15, "Post limit"),
      collapseAfter(5),
      { key: "sort-by", label: "Sort by", kind: "enum", options: ["hot", "new"], default: "hot" },
      { key: "tags", label: "Tags", kind: "list", help: "Only posts with one of these tags. Sorting is then always Hot." },
    ],
  },
  // widget-reddit.go
  {
    type: "reddit", label: "Reddit", category: "Feeds", refresh: { kind: "interval", default: "30m" },
    fields: [
      { key: "subreddit", label: "Subreddit", kind: "text", required: true },
      {
        key: "style", label: "Style", kind: "enum", options: ["vertical-list", "horizontal-cards", "vertical-cards"], default: "vertical-list",
        help: "The first two suit full columns; vertical cards suit small columns.",
      },
      { key: "show-thumbnails", label: "Show thumbnails", kind: "bool" },
      { key: "show-flairs", label: "Show flairs", kind: "bool" },
      limit(15, "Post limit"),
      collapseAfter(5),
      { key: "comments-url-template", label: "Comments link template", kind: "text", help: "{POST-PATH} and {POST-ID} are replaced." },
      {
        key: "request-url-template", label: "Request URL template", kind: "text", sample: "https://proxy.example/?u={REQUEST-URL}",
        dummy: "x{REQUEST-URL}", // not "{…}" alone: in a plain scalar that would parse as a map
        help: "Must contain {REQUEST-URL}.",
      },
      { key: "proxy", label: "Proxy", kind: "url", wrongType: ["x"], help: "A proxy URL. The longer form with timeout and allow-insecure is edited in YAML." },
      { key: "sort-by", label: "Sort by", kind: "enum", options: ["hot", "new", "top", "rising"], default: "hot" },
      {
        key: "top-period", label: "Top period", kind: "enum", options: ["hour", "day", "week", "month", "year", "all"], default: "day",
        help: "Only used when sorting by Top.",
      },
      { key: "search", label: "Search", kind: "text", help: "Works only with App authentication, since Reddit changed its API." },
      ENGAGEMENT,
      {
        key: "app-auth", label: "App authentication", kind: "object", help: "Name, client ID and client secret, all three or none.",
        item: [
          { key: "name", label: "App name", kind: "text" },
          { key: "id", label: "Client ID", kind: "text" },
          { key: "secret", label: "Client secret", kind: "text" },
        ],
        sample: { name: "a", id: "b", secret: "c" },
      },
    ],
  },
  // widget-twitch-channels.go
  {
    type: "twitch-channels", label: "Twitch channels", category: "Feeds", refresh: { kind: "interval", default: "10m" },
    fields: [
      { key: "channels", label: "Channels", kind: "list", docsRequired: true },
      collapseAfter(5),
      { key: "sort-by", label: "Sort by", kind: "enum", options: ["viewers", "live"], default: "viewers" },
    ],
  },
  // widget-twitch-top-games.go
  {
    type: "twitch-top-games", label: "Twitch top games", category: "Feeds", refresh: { kind: "interval", default: "10m" },
    fields: [
      { key: "exclude", label: "Exclude", kind: "list", help: "Category slugs to leave out." },
      limit(10, "Game limit"),
      collapseAfter(5),
    ],
  },
  // widget-search.go
  {
    type: "search", label: "Search", category: "Tools", refresh: { kind: "none" },
    fields: [
      {
        key: "search-engine", label: "Search engine", kind: "text", default: "duckduckgo",
        help: "duckduckgo, google, bing, perplexity, kagi, startpage or brave, or a URL with {QUERY}.",
      },
      { key: "new-tab", label: "Open results in a new tab", kind: "bool" },
      { key: "autofocus", label: "Focus the search box on load", kind: "bool" },
      { key: "target", label: "Link target", kind: "enum", options: ["_blank", "_self", "_parent", "_top"], default: "_blank" },
      { key: "placeholder", label: "Placeholder text", kind: "text", default: "Type here to search…" },
      {
        key: "bangs", label: "Bangs", kind: "objectList",
        item: [
          { key: "title", label: "Title", kind: "text" },
          { key: "shortcut", label: "Shortcut", kind: "text", required: true, sample: "!yt" },
          { key: "url", label: "URL", kind: "url", required: true, sample: "https://www.youtube.com/results?search_query={QUERY}" },
        ],
      },
    ],
  },
  // widget-bookmarks.go
  {
    type: "bookmarks", label: "Bookmarks", category: "Tools", section: "bookmarks", refresh: { kind: "none" },
    fields: [
      {
        key: "groups", label: "Groups", kind: "objectList", docsRequired: true,
        item: [
          { key: "title", label: "Title", kind: "text" },
          { key: "color", label: "Colour", kind: "hsl", help: "Defaults to the theme's primary colour." },
          { key: "same-tab", label: "Open in the same tab", kind: "bool" },
          { key: "hide-arrow", label: "Hide arrow", kind: "bool" },
          { key: "target", label: "Link target", kind: "text" },
          {
            key: "links", label: "Links", kind: "objectList", docsRequired: true,
            item: [
              { key: "title", label: "Title", kind: "text", docsRequired: true },
              { key: "url", label: "URL", kind: "url", docsRequired: true },
              { key: "description", label: "Description", kind: "text" },
              { key: "icon", label: "Icon", kind: "icon" },
              { key: "same-tab", label: "Open in the same tab", kind: "bool" },
              { key: "hide-arrow", label: "Hide arrow", kind: "bool" },
              { key: "target", label: "Link target", kind: "text" },
            ],
          },
        ],
      },
    ],
  },
  // widget-todo.go
  {
    type: "to-do", label: "To-do", category: "Tools", refresh: { kind: "none" },
    fields: [
      { key: "id", label: "List ID", kind: "text", help: "Tasks are stored in the browser. Give lists the same ID to share them." },
    ],
  },
  // widget-clock.go
  {
    type: "clock", label: "Clock", category: "Info", refresh: { kind: "none" },
    fields: [
      HOUR_FORMAT("24h", true),
      {
        key: "timezones", label: "Time zones", kind: "objectList",
        item: [
          { key: "timezone", label: "Time zone", kind: "text", required: true, sample: "Europe/Berlin", dummy: "UTC", help: "An IANA name such as Europe/London." },
          { key: "label", label: "Label", kind: "text" },
        ],
      },
    ],
  },
  // widget-calendar.go
  {
    type: "calendar", label: "Calendar", category: "Info", refresh: { kind: "none" },
    fields: [
      {
        key: "first-day-of-week", label: "First day of the week", kind: "enum", strict: true, default: "monday",
        options: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      },
    ],
  },
  // widget-old-calendar.go
  {
    type: "calendar-legacy", label: "Calendar (legacy)", category: "Info", refresh: { kind: "hourly" },
    fields: [{ key: "start-sunday", label: "Start weeks on Sunday", kind: "bool" }],
  },
  // widget-weather.go
  {
    type: "weather", label: "Weather", category: "Info", refresh: { kind: "hourly" },
    fields: [
      { key: "location", label: "Location", kind: "text", required: true, sample: "Berlin, Germany", help: "City, optionally with country." },
      { key: "units", label: "Units", kind: "enum", options: ["metric", "imperial"], default: "metric", strict: true },
      HOUR_FORMAT("12h", true),
      { key: "hide-location", label: "Hide location", kind: "bool" },
      { key: "show-area-name", label: "Show area name", kind: "bool" },
    ],
  },
  // widget-markets.go ("markets" and the older name "stocks" are the same widget)
  {
    type: "markets", label: "Markets", category: "Info", refresh: { kind: "interval", default: "1h" },
    fields: [
      { key: "markets", label: "Markets", kind: "objectList", docsRequired: true, item: MARKET_ITEM },
      {
        key: "sort-by", label: "Sort by", kind: "enum", options: ["change", "absolute-change"],
        help: "Empty keeps the order above.",
      },
      { key: "chart-link-template", label: "Chart link template", kind: "text", help: "{SYMBOL} is replaced with the symbol." },
      { key: "symbol-link-template", label: "Symbol link template", kind: "text", help: "{SYMBOL} is replaced with the symbol." },
      // Legacy list name, used only when `markets` is empty ("remove in v0.10.0").
      { key: "stocks", label: "Stocks (old name for Markets)", kind: "objectList", item: MARKET_ITEM, hidden: true },
    ],
  },
  // widget-monitor.go
  {
    type: "monitor", label: "Monitor", category: "Server", refresh: { kind: "interval", default: "5m" },
    fields: [
      { key: "style", label: "Style", kind: "enum", options: ["compact"] },
      { key: "show-failing-only", label: "Show failing only", kind: "bool" },
      {
        key: "sites", label: "Sites", kind: "objectList", docsRequired: true,
        item: [
          { key: "title", label: "Title", kind: "text", docsRequired: true },
          { key: "url", label: "URL", kind: "url", docsRequired: true },
          { key: "check-url", label: "Check URL", kind: "url", help: "Checked instead of the URL, e.g. an internal address." },
          { key: "error-url", label: "Error URL", kind: "url", help: "Opened instead of the URL while the site is down." },
          { key: "icon", label: "Icon", kind: "icon" },
          { key: "timeout", label: "Timeout", kind: "duration", default: "3s" },
          { key: "allow-insecure", label: "Allow invalid certificates", kind: "bool" },
          { key: "same-tab", label: "Open in the same tab", kind: "bool" },
          { key: "alt-status-codes", label: "Other OK status codes", kind: "list", of: "number", sample: [403] },
          BASIC_AUTH,
        ],
      },
    ],
  },
  // widget-docker-containers.go
  {
    type: "docker-containers", label: "Docker containers", category: "Server", section: "containers", refresh: { kind: "interval", default: "1m" },
    fields: [
      { key: "hide-by-default", label: "Hide by default", kind: "bool", help: "When on, only containers you switch on below are shown." },
      { key: "format-container-names", label: "Format container names", kind: "bool" },
      { key: "sock-path", label: "Docker socket path", kind: "text", default: "/var/run/docker.sock" },
      { key: "category", label: "Category", kind: "text", help: "Only containers with this glance.category label, and the ones under them (glance.parent)." },
      { key: "running-only", label: "Running only", kind: "bool" },
      {
        // `containers` is map[string]map[string]string: per container, the glance.* labels without the prefix.
        key: "containers", label: "Containers", kind: "keyedList", keyField: { key: "container", label: "Container name" },
        item: [
          { key: "name", label: "Name", kind: "text" },
          { key: "icon", label: "Icon", kind: "icon" },
          { key: "url", label: "URL", kind: "url" },
          { key: "description", label: "Description", kind: "text" },
          { key: "same-tab", label: "Open in the same tab", kind: "bool" },
          { key: "hide", label: "Hide", kind: "bool" },
          { key: "id", label: "ID", kind: "text" },
          { key: "parent", label: "Parent", kind: "text" },
          { key: "category", label: "Category", kind: "text" },
        ],
      },
    ],
  },
  // widget-server-stats.go, pkg/sysinfo/sysinfo.go SystemInfoRequest
  {
    type: "server-stats", label: "Server stats", category: "Server", refresh: { kind: "interval", default: "15s" },
    fields: [
      {
        key: "servers", label: "Servers", kind: "objectList", help: "Empty shows this server.",
        item: [
          { key: "type", label: "Type", kind: "enum", options: ["local", "remote"], docsRequired: true, help: "Anything other than local is treated as remote." },
          { key: "name", label: "Name", kind: "text", help: "Defaults to the host name." },
          { key: "hide-swap", label: "Hide swap", kind: "bool" },
          { key: "url", label: "URL", kind: "url", help: "Remote servers only." },
          { key: "token", label: "Token", kind: "text", help: "Remote servers only." },
          { key: "timeout", label: "Timeout", kind: "duration", default: "3s", help: "Remote servers only." },
          { key: "cpu-temp-sensor", label: "CPU temperature sensor", kind: "text", help: "Local server only." },
          { key: "hide-mountpoints-by-default", label: "Hide mount points by default", kind: "bool", help: "Local server only." },
          {
            key: "mountpoints", label: "Mount points", kind: "keyedList", keyField: { key: "path", label: "Path" }, help: "Local server only.",
            item: [
              { key: "name", label: "Name", kind: "text" },
              { key: "hide", label: "Hide", kind: "bool" },
            ],
          },
        ],
      },
    ],
  },
  // widget-dns-stats.go
  {
    type: "dns-stats", label: "DNS stats", category: "Server", refresh: { kind: "interval", default: "10m" },
    fields: [
      {
        key: "service", label: "Service", kind: "enum", options: ["adguard", "pihole", "pihole-v6", "technitium"], strict: true, required: true,
        help: "pihole is Pi-hole 5 and older; pihole-v6 is Pi-hole 6 and newer.",
      },
      { key: "allow-insecure", label: "Allow invalid certificates", kind: "bool" },
      { key: "url", label: "URL", kind: "url", docsRequired: true },
      { key: "username", label: "Username", kind: "text", help: "AdGuard only." },
      { key: "password", label: "Password", kind: "text", help: "AdGuard and Pi-hole 6." },
      { key: "token", label: "Token", kind: "text", help: "Pi-hole 5 only." },
      { key: "hide-graph", label: "Hide graph", kind: "bool" },
      { key: "hide-top-domains", label: "Hide top domains", kind: "bool" },
      HOUR_FORMAT("12h", false),
    ],
  },
  // widget-releases.go
  {
    type: "releases", label: "Releases", category: "Dev", refresh: { kind: "interval", default: "2h" },
    fields: [
      {
        key: "repositories", label: "Repositories", kind: "list", docsRequired: true, sample: ["glanceapp/glance"],
        help: "One owner/repo per line. Prefix gitlab:, codeberg: or dockerhub: for other hosts.",
      },
      { key: "show-source-icon", label: "Show source icon", kind: "bool" },
      { key: "token", label: "GitHub token", kind: "text" },
      { key: "gitlab-token", label: "GitLab token", kind: "text" },
      limit(10, "Release limit"),
      collapseAfter(5),
    ],
  },
  // widget-repository.go
  {
    type: "repository", label: "Repository", category: "Dev", refresh: { kind: "interval", default: "1h" },
    fields: [
      { key: "repository", label: "Repository", kind: "text", docsRequired: true, help: "owner/repo on GitHub." },
      { key: "token", label: "GitHub token", kind: "text" },
      { key: "pull-requests-limit", label: "Pull request limit", kind: "number", integer: true, default: 3, help: "-1 hides them." },
      { key: "issues-limit", label: "Issue limit", kind: "number", integer: true, default: 3, help: "-1 hides them." },
      { key: "commits-limit", label: "Commit limit", kind: "number", integer: true, default: -1, help: "-1 hides them." },
    ],
  },
  // widget-changedetection.go
  {
    type: "change-detection", label: "ChangeDetection.io", category: "Dev", refresh: { kind: "interval", default: "1h" },
    fields: [
      { key: "instance-url", label: "Instance URL", kind: "url", default: "https://www.changedetection.io" },
      { key: "token", label: "API token", kind: "text" },
      limit(10, "Watch limit"),
      collapseAfter(5),
      { key: "watches", label: "Watch IDs", kind: "list", help: "Empty shows all watches." },
    ],
  },
  // widget-group.go
  {
    type: "group", label: "Group", category: "Layout", container: true, disallowedChildren: ["group", "split-column"],
    refresh: { kind: "none" },
    fields: [{ key: "widgets", label: "Widgets", kind: "widgets", sample: [] }],
  },
  // widget-split-column.go
  {
    type: "split-column", label: "Split column", category: "Layout", container: true, refresh: { kind: "none" },
    fields: [
      { key: "max-columns", label: "Max columns", kind: "number", integer: true, default: 2 },
      { key: "widgets", label: "Widgets", kind: "widgets", sample: [] },
    ],
  },
  // widget-custom-api.go
  {
    type: "custom-api", label: "Custom API", category: "Advanced", refresh: { kind: "interval", default: "1h" },
    fields: [
      ...API_REQUEST,
      { key: "template", label: "Template", kind: "text", multiline: true, required: true, sample: "<p>{{ .JSON.String \"a\" }}</p>", help: "A Go HTML template." },
      { key: "frameless", label: "Frameless", kind: "bool" },
      { key: "options", label: "Options", kind: "yaml", sample: { a: 1 }, wrongType: ["x"], help: "Values the template can read." },
      {
        key: "subrequests", label: "Subrequests", kind: "keyedList", keyField: { key: "name", label: "Name" },
        item: API_REQUEST,
      },
    ],
  },
  // widget-extension.go
  {
    type: "extension", label: "Extension", category: "Advanced", refresh: { kind: "interval", default: "30m" },
    fields: [
      { key: "url", label: "URL", kind: "url", required: true, sample: "https://example.com/extension" },
      { key: "fallback-content-type", label: "Fallback content type", kind: "enum", options: ["html"] },
      { key: "allow-potentially-dangerous-html", label: "Allow potentially dangerous HTML", kind: "bool" },
      HEADERS,
      PARAMETERS,
    ],
  },
  // widget-iframe.go
  {
    type: "iframe", label: "iframe", category: "Advanced", refresh: { kind: "none" },
    fields: [
      { key: "source", label: "Source URL", kind: "url", required: true, sample: "https://example.com/" },
      // Docs: default 300. Source (v0.8.6 widget-iframe.go:30-34): unset becomes 50, and 50 becomes 300.
      { key: "height", label: "Height", kind: "number", integer: true, default: 50, help: "In pixels." },
    ],
  },
  // widget-html.go
  {
    type: "html", label: "HTML", category: "Advanced", refresh: { kind: "none" },
    fields: [{ key: "source", label: "HTML", kind: "text", multiline: true }],
  },
];

const markets = list.find((s) => s.type === "markets")!;
list.push({ ...markets, type: "stocks", label: "Markets (old name: stocks)", aliasOf: "markets" });

/** Every widget type Glance v0.8.6 accepts (widget.go newWidget), in the prototype's order, aliases last. */
export const WIDGETS: Readonly<Record<string, WidgetSchema>> = Object.fromEntries(list.map((s) => [s.type, s]));
export const WIDGET_TYPES: readonly string[] = list.map((s) => s.type);

/** Common fields followed by the type's own fields. */
export function widgetFields(type: string): Field[] {
  const s = WIDGETS[type];
  return s ? [...COMMON_FIELDS, ...s.fields] : [];
}
