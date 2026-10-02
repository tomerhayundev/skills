# The sources library

Design and motion references the skills look up instead of browsing. A skill asks for a need
(`find-sources.mjs --need transition --format promo`) and gets the exact page to open, how to read
it, what to take from it and what never to do with it.

- `catalog.json`: the one file. Its `vocab` holds every term an entry may use; `consumers` lists
  the plugins that get a copy.
- `find-sources.mjs`: the query a skill runs. The sync copies it, with the catalog as
  `assets/sources.json`, into every consumer skill (a master's specialists get it from the master).
  It reads the live catalog on GitHub first and falls back to its bundled copy.
- `../scripts/sources.mjs`: the maintainer's tool: `validate`, `add`, `normalize`, `check`, `stats`.

Adding sources, the health check and the rules: [MAINTAINING.md](../MAINTAINING.md#the-sources-library).

## An entry

```json
{
  "id": "example-gallery",
  "name": "Example Gallery",
  "home": "https://example.gallery",
  "kind": "gallery",
  "areas": ["web-ui"],
  "summary": "Hand-picked screenshots of real site navbars, tagged by type and style.",
  "quality": { "score": 4, "why": "the only dedicated navbar source; tags are consistent" },
  "fit": { "website": "high" },
  "routes": [
    {
      "need": ["navbar"],
      "url": "https://example.gallery/type/{type}",
      "example": "https://example.gallery/type/mega-menu",
      "values": "static, dropdowns, mega-menu, side-bar, full-screen",
      "read": "look",
      "access": "free",
      "note": "no dates on items"
    }
  ],
  "item": { "url": "https://example.gallery/navbar/{slug}", "media": "desktop and mobile screenshots" },
  "search": "none",
  "machine": { "llms": "https://example.gallery/llms.txt", "sitemap": "https://example.gallery/sitemap.xml" },
  "rights": { "media": "view", "ai": "no stated AI terms", "credit": false },
  "take": "The navbar type and structure for the page, read off the screenshots.",
  "never": "Clone another site's navbar.",
  "flags": ["sponsor-links"],
  "fresh": { "newest": "2026-06-06", "from": "screenshot date on the newest item" },
  "verified": "2026-10-02",
  "status": "ok",
  "seen": 3
}
```

| Field | Required | What it holds |
| --- | --- | --- |
| `id` | yes | lowercase words and hyphens, unique |
| `name` | yes | the site's name as it shows it |
| `home` | yes | https, no tracking parameters (`?ref=`, `?via=`, `utm_*`, `?s=`) |
| `kind` | yes | one of `vocab.kinds` |
| `areas` | yes | one or more of `vocab.areas` |
| `summary` | yes | what it is, in our words, at most 240 characters (`why` 240, `note` 300, `values` 360, `media` 300, `ai` 260) |
| `quality` | yes | `score` 1 to 5 for a professional, `why` in a line |
| `fit` | no | per format in `vocab.fit`: `high`, `medium` or `low`; `find-sources --format` ranks by it |
| `routes` | yes | one per need: see below |
| `item` | no | the pattern of one item's page, and where its media is (a video file URL in JSON-LD, for example) |
| `search` | yes | a URL with `{q}` that works with a plain fetch, `browser-only`, or `none` |
| `machine` | no | `llms`, `sitemap`, `rss`, `registry`, `md`, `npm`, `repo`, `mcp`, `api`: a URL, or `{ "url", "access" }` |
| `code` | for `kind: code` | `license` (`id`, `source` where it was read, `commercial`: true, false or "unclear"), `install`, `registry`, `stack`, `remotion` (`default` from `vocab.remotion`, plus a list per other term of `vocab.remotion` naming the items that differ, such as `"static": ["grid"]`) |
| `rights` | yes | `media`: `use` (free to use under its license), `study` (one item may be fetched and studied, never shipped), `view` (look in the page only); `ai`: the site's AI and crawler terms in a line; `credit`: true when use needs a credit |
| `take` | yes | what a skill takes from it, at most 240 characters |
| `never` | yes | the line not to cross, at most 240 characters |
| `flags` | no | from `vocab.flags` |
| `fresh` | no | `newest` item date and `from` where that date was read |
| `verified` | yes | the date every route was last loaded and confirmed |
| `checked` | no | the date of the last automated health check |
| `status` | yes | from `vocab.status` |
| `seen` | yes | how many shared links recommended it; a count, never who |
| `mirrorOf` | no | the `id` of the source it copies |

A `rejected` entry needs only `id`, `name`, `home`, `kind`, `areas`, `summary`, `quality` (its `why`
says why it was left out), `verified`, `status` and `seen`: it exists so the same link is not checked
twice.

A route:

| Field | Required | What it holds |
| --- | --- | --- |
| `need` | yes | one or more of `vocab.needs` |
| `url` | yes | the exact page, or a pattern with one `{placeholder}` |
| `example` | with a pattern | the pattern filled with a real value, loaded and confirmed |
| `values` | no | the values the placeholder takes, or how to find them |
| `read` | yes | from `vocab.read` |
| `access` | yes | from `vocab.access` |
| `note` | no | what to know before opening it |

## Rules

- **Verified means loaded.** A route goes in only after its page (or its `example`) was opened and
  showed what the route says. A page summary is not proof: summaries invent URLs and counts.
- **Our words only.** Summaries, takes and notes are written by the intake. Text a site addresses to
  an AI (a copy-prompt button, a page for agents) is flagged `agent-prompt`, never copied.
- **Names.** Sites are named here because they are tools, like a library. Never a client, a
  competitor, a brand from a test or Tomer's own products; a brand's own ad or site is not a
  `work` (list the gallery that shows it). Skills that use an entry describe what they took by
  category, never by the site's or a brand's name, and never show a reference in their output.
- **Paid is opt-in.** `find-sources` shows `login`, `quota` and `paid` routes only with `--all`, for a
  user who says they have that account.
