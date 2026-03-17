---
name: stitch-sdk
description: "Use when building UI screens programmatically with Google Stitch SDK — generating screens from text prompts, editing designs, creating variants, extracting HTML/screenshots, or integrating Stitch into AI agent workflows via the Domain API, Tool Client, or Vercel AI SDK adapter."
---

# Stitch SDK — AI-Powered UI Generation

Generate production-quality UI screens from text prompts using `@google/stitch-sdk`. Extract HTML and screenshots programmatically. Works standalone, in agent pipelines, or with Vercel AI SDK.

## When to Use

- Generating UI screens/pages from text descriptions
- Editing or iterating on generated designs
- Creating design variants (color, layout, fonts)
- Extracting HTML or screenshot URLs from generated screens
- Building AI agents that create UI autonomously
- Prototyping UI flows without manual design tools

## When NOT to Use

- Static HTML/CSS coding by hand (no generation needed)
- Design systems that don't involve AI generation
- Image generation (Stitch generates UI, not arbitrary images)

## Prerequisites

```bash
npm install -g @google/stitch-sdk
```

Set your API key:
```bash
export STITCH_API_KEY="your-api-key"
```

Get an API key from [Google AI Studio](https://aistudio.google.com/apikey).

## Core Pattern: Generate → Edit → Extract

```ts
import { stitch } from "@google/stitch-sdk";

// 1. Create a project (container for screens)
const project = await stitch.createProject("My App");

// 2. Generate a screen from a text prompt
const screen = await project.generate("A login page with email and password fields");

// 3. Edit the screen iteratively
const edited = await screen.edit("Make the background dark and add a sidebar");

// 4. Extract outputs
const html = await edited.getHtml();      // Download URL for HTML
const imageUrl = await edited.getImage(); // Download URL for screenshot
```

## Quick Reference

| Task | Code |
|------|------|
| Create project | `stitch.createProject("title")` |
| List projects | `stitch.projects()` |
| Reference existing project | `stitch.project("id")` |
| Generate screen | `project.generate("prompt", "DESKTOP")` |
| Edit screen | `screen.edit("prompt")` |
| Generate variants | `screen.variants("prompt", { variantCount: 3, creativeRange: "EXPLORE" })` |
| Get HTML URL | `screen.getHtml()` |
| Get screenshot URL | `screen.getImage()` |
| List screens | `project.screens()` |
| Get specific screen | `project.getScreen("screenId")` |

## Device Types

| Value | Use For |
|-------|---------|
| `"DESKTOP"` | Web apps, dashboards, landing pages |
| `"MOBILE"` | Mobile-first designs |
| `"TABLET"` | Tablet layouts |
| `"AGNOSTIC"` | Responsive / device-independent |

## Model Selection

| Model | Best For |
|-------|---------|
| `"GEMINI_3_PRO"` | Higher quality, complex layouts (default) |
| `"GEMINI_3_FLASH"` | Faster generation, simpler screens |

Pass as third argument: `project.generate("prompt", "DESKTOP", "GEMINI_3_FLASH")`

## Design Variants

Generate multiple variations of a screen to explore design directions:

```ts
const variants = await screen.variants("Try different color schemes", {
  variantCount: 3,          // 1-5 variants
  creativeRange: "EXPLORE", // "REFINE" | "EXPLORE" | "REIMAGINE"
  aspects: ["COLOR_SCHEME", "LAYOUT"], // What to vary
});

for (const v of variants) {
  console.log(v.id, await v.getHtml());
}
```

**Variant aspects:** `"LAYOUT"`, `"COLOR_SCHEME"`, `"IMAGES"`, `"TEXT_FONT"`, `"TEXT_CONTENT"`

**Creative range:**
- `"REFINE"` — Small tweaks, stays close to original
- `"EXPLORE"` — Moderate changes, balanced creativity
- `"REIMAGINE"` — Bold redesigns, maximum creativity

## Three Usage Modes

### 1. Domain API (Recommended for most use cases)

The `stitch` singleton reads `STITCH_API_KEY` from env automatically:

```ts
import { stitch } from "@google/stitch-sdk";
const project = await stitch.createProject("App");
const screen = await project.generate("Dashboard with charts");
```

### 2. Tool Client (For agents / orchestration)

Direct MCP tool access for agent pipelines:

```ts
import { StitchToolClient } from "@google/stitch-sdk";
const client = new StitchToolClient(); // reads STITCH_API_KEY from env
const result = await client.callTool("create_project", { title: "Agent Project" });
const tools = await client.listTools(); // discover available tools
await client.close();
```

### 3. Vercel AI SDK Adapter

Drop Stitch tools into any AI SDK `generateText` call:

```ts
import { stitchTools } from "@google/stitch-sdk/ai";
import { generateText } from "ai";

const { text } = await generateText({
  model: yourModel,
  tools: stitchTools(),
  prompt: "Create a login page",
  maxSteps: 5,
});
```

Filter tools: `stitchTools({ include: ["generate_screen_from_text"] })`

## MCP Proxy Server

Expose Stitch as an MCP server for other agents:

```ts
import { StitchProxy } from "@google/stitch-sdk";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const proxy = new StitchProxy({ apiKey: "..." });
await proxy.start(new StdioServerTransport());
```

## Error Handling

```ts
import { stitch, StitchError } from "@google/stitch-sdk";

try {
  await stitch.project("bad-id").screens();
} catch (err) {
  if (err instanceof StitchError) {
    console.error(err.code);        // e.g. "NOT_FOUND"
    console.error(err.message);     // Human-readable
    console.error(err.recoverable); // boolean
  }
}
```

**Error codes:** `AUTH_FAILED`, `NOT_FOUND`, `PERMISSION_DENIED`, `RATE_LIMITED`, `NETWORK_ERROR`, `VALIDATION_ERROR`, `UNKNOWN_ERROR`

## Explicit Configuration

Override defaults when needed:

```ts
import { Stitch, StitchToolClient } from "@google/stitch-sdk";

const client = new StitchToolClient({
  apiKey: "your-key",
  baseUrl: "https://stitch.googleapis.com/mcp",
  timeout: 300_000,
});
const sdk = new Stitch(client);
```

| Option | Default | Description |
|--------|---------|-------------|
| `apiKey` | `STITCH_API_KEY` env | API key |
| `accessToken` | `STITCH_ACCESS_TOKEN` env | OAuth token (alternative) |
| `projectId` | `GOOGLE_CLOUD_PROJECT` env | Cloud project (with OAuth) |
| `baseUrl` | `https://stitch.googleapis.com/mcp` | MCP server URL |
| `timeout` | `300000` | Request timeout in ms |

Auth requires either `apiKey` OR both `accessToken` + `projectId`.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Missing `STITCH_API_KEY` | Set env var or pass `apiKey` in config |
| Calling `getHtml()` expecting HTML string | Returns a **download URL**, not raw HTML — fetch the URL |
| Not closing `StitchToolClient` | Always call `client.close()` when done |
| Using wrong device type for layout | Use `"DESKTOP"` for web, `"MOBILE"` for mobile-first |
| Generating too many variants | Max is 5 per call |

## Full API Reference

See [references/api-reference.md](references/api-reference.md) for complete class/method documentation.
