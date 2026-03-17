# Stitch SDK — Full API Reference

Package: `@google/stitch-sdk` v0.0.3
License: Apache 2.0
Source: [github.com/google-labs-code/stitch-sdk](https://github.com/google-labs-code/stitch-sdk)

---

## Exports

```ts
// Main entry
import { Stitch, Project, Screen, StitchToolClient, StitchProxy, stitch, StitchError, StitchErrorCode } from "@google/stitch-sdk";

// Types
import type { StitchConfig, StitchConfigInput, ProjectData, GenerateScreenParams, DesignTheme, ScreenInstance, ThumbnailScreenshot } from "@google/stitch-sdk";

// Vercel AI SDK adapter
import { stitchTools } from "@google/stitch-sdk/ai";
```

---

## `stitch` Singleton

Pre-configured `Stitch` instance that reads `STITCH_API_KEY` from environment. Lazily initialized on first use. Also exposes `listTools()`, `callTool()`, and `close()` from `StitchToolClient`.

```ts
import { stitch } from "@google/stitch-sdk";
const projects = await stitch.projects();
await stitch.callTool("create_project", { title: "My App" });
```

---

## `Stitch` Class

Main entry point. Manages projects.

### Constructor

```ts
const client = new StitchToolClient({ apiKey: "..." });
const sdk = new Stitch(client);
```

### Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `createProject(title?)` | `title?: string` | `Promise<Project>` | Create a new project |
| `projects()` | — | `Promise<Project[]>` | List all accessible projects |
| `project(id)` | `id: string` | `Project` | Reference project by ID (no API call) |

---

## `Project` Class

A Stitch project containing screens.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Alias for `projectId` |
| `projectId` | `string` | Bare project ID (no `projects/` prefix) |
| `data` | `any` | Raw project data from API |

### Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `generate(prompt, deviceType?, modelId?)` | `prompt: string`, `deviceType?: DeviceType`, `modelId?: ModelId` | `Promise<Screen>` | Generate a screen from text prompt |
| `screens()` | — | `Promise<Screen[]>` | List all screens in project |
| `getScreen(screenId)` | `screenId: string` | `Promise<Screen>` | Retrieve specific screen by ID |

### DeviceType

`"DEVICE_TYPE_UNSPECIFIED"` | `"MOBILE"` | `"DESKTOP"` | `"TABLET"` | `"AGNOSTIC"`

### ModelId

`"MODEL_ID_UNSPECIFIED"` | `"GEMINI_3_PRO"` | `"GEMINI_3_FLASH"`

---

## `Screen` Class

A generated UI screen. Provides access to HTML and screenshots.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Alias for `screenId` |
| `screenId` | `string` | Bare screen ID |
| `projectId` | `string` | Parent project ID |
| `data` | `any` | Raw screen data from API |

### Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `edit(prompt, deviceType?, modelId?)` | `prompt: string`, `deviceType?: DeviceType`, `modelId?: ModelId` | `Promise<Screen>` | Edit screen with text prompt |
| `variants(prompt, variantOptions, deviceType?, modelId?)` | `prompt: string`, `variantOptions: VariantOptions`, `deviceType?: DeviceType`, `modelId?: ModelId` | `Promise<Screen[]>` | Generate design variants |
| `getHtml()` | — | `Promise<string>` | Get HTML download URL |
| `getImage()` | — | `Promise<string>` | Get screenshot download URL |

**Note:** `getHtml()` and `getImage()` use cached data from the generation response when available. If the screen was loaded via `screens()` or `getScreen()`, they call the `get_screen` API automatically.

### VariantOptions

```ts
{
  variantCount?: number;       // 1-5, default 3
  creativeRange?: string;      // "REFINE" | "EXPLORE" | "REIMAGINE"
  aspects?: string[];          // ["LAYOUT", "COLOR_SCHEME", "IMAGES", "TEXT_FONT", "TEXT_CONTENT"]
}
```

---

## `StitchToolClient` Class

Low-level authenticated pipe to the Stitch MCP server. For agents and orchestration.

### Constructor

```ts
const client = new StitchToolClient();                    // reads env
const client = new StitchToolClient({ apiKey: "..." });   // explicit
```

### Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `connect()` | — | `Promise<void>` | Explicitly connect (auto-called by `callTool`) |
| `callTool<T>(name, args)` | `name: string`, `args: Record<string, any>` | `Promise<T>` | Call an MCP tool |
| `listTools()` | — | `Promise<{ tools: ToolDef[] }>` | List available tools |
| `close()` | — | `Promise<void>` | Close connection |

### Available MCP Tools

| Tool Name | Description |
|-----------|-------------|
| `create_project` | Create a new project |
| `list_projects` | List all projects |
| `generate_screen_from_text` | Generate screen from prompt |
| `edit_screens` | Edit existing screens |
| `generate_variants` | Generate design variants |
| `list_screens` | List screens in project |
| `get_screen` | Get screen details |

---

## `StitchProxy` Class

MCP proxy server that forwards requests to Stitch.

### Constructor

```ts
const proxy = new StitchProxy({ apiKey: "..." });
```

### Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `start(transport)` | `transport: Transport` | `Promise<void>` | Start proxy server |
| `close()` | — | `Promise<void>` | Stop proxy server |

### Usage with stdio

```ts
import { StitchProxy } from "@google/stitch-sdk";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const proxy = new StitchProxy({ apiKey: process.env.STITCH_API_KEY });
await proxy.start(new StdioServerTransport());
```

---

## `stitchTools()` — Vercel AI SDK Adapter

Returns Stitch tools in Vercel AI SDK format. Each tool is pre-wired with `execute` → `callTool`.

```ts
import { stitchTools } from "@google/stitch-sdk/ai";

stitchTools();                                          // all tools
stitchTools({ apiKey: "..." });                         // explicit key
stitchTools({ include: ["generate_screen_from_text"] }); // filter tools
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `apiKey` | `string` | Override `STITCH_API_KEY` env var |
| `include` | `string[]` | Only include specific tool names |

---

## `StitchError` Class

Extends `Error`. Thrown by all domain class methods on failure.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `code` | `StitchErrorCode` | Error category |
| `message` | `string` | Human-readable description |
| `suggestion` | `string?` | Optional fix suggestion |
| `recoverable` | `boolean` | Whether retry might help |

### Static Methods

| Method | Description |
|--------|-------------|
| `StitchError.fromUnknown(error)` | Wrap unknown error as StitchError |

### Error Codes

| Code | Meaning |
|------|---------|
| `AUTH_FAILED` | Invalid or missing API key / token |
| `NOT_FOUND` | Project or screen doesn't exist |
| `PERMISSION_DENIED` | No access to resource |
| `RATE_LIMITED` | Too many requests |
| `NETWORK_ERROR` | Connection failure |
| `VALIDATION_ERROR` | Invalid parameters |
| `UNKNOWN_ERROR` | Catch-all |

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STITCH_API_KEY` | Yes (or OAuth) | API key for auth |
| `STITCH_ACCESS_TOKEN` | No | OAuth access token (alternative) |
| `GOOGLE_CLOUD_PROJECT` | With OAuth | Google Cloud project ID |
| `STITCH_HOST` | No | Override MCP server URL |

### StitchConfig

```ts
{
  apiKey?: string;       // default: STITCH_API_KEY env
  accessToken?: string;  // default: STITCH_ACCESS_TOKEN env
  projectId?: string;    // default: GOOGLE_CLOUD_PROJECT env
  baseUrl?: string;      // default: "https://stitch.googleapis.com/mcp"
  timeout?: number;      // default: 300000 (5 min)
}
```

Auth requires either `apiKey` OR both `accessToken` + `projectId`.

---

## Types

### ProjectData

```ts
interface ProjectData {
  name: string;
  title?: string;
  visibility: string;
  createTime: string;
  updateTime: string;
  projectType?: string;
  origin?: string;
  deviceType?: string;
  thumbnailScreenshot?: ThumbnailScreenshot;
  designTheme: DesignTheme;
  screenInstances?: ScreenInstance[];
}
```

### DesignTheme

```ts
interface DesignTheme {
  colorMode?: string;
  font?: string;
  roundness?: string;
  customColor?: string;
  saturation?: number;
}
```

### ScreenInstance

```ts
interface ScreenInstance {
  id: string;
  sourceScreen: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}
```

### GenerateScreenParams

```ts
interface GenerateScreenParams {
  prompt: string;
  deviceType?: "MOBILE" | "DESKTOP" | "DEVICE_TYPE_UNSPECIFIED";
}
```
