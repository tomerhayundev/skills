# Stitch SDK Skill

> AI-Powered UI Generation — Generate production-quality UI screens from text prompts using Google's Stitch SDK.

[![npm](https://img.shields.io/npm/v/@google/stitch-sdk)](https://www.npmjs.com/package/@google/stitch-sdk)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](https://github.com/google-labs-code/stitch-sdk/blob/main/LICENSE)

## One-Command Install

```bash
curl -fsSL https://raw.githubusercontent.com/tomerhayundev/skills/main/skills/stitch-sdk/install.sh | bash
```

This will:
1. Verify Node.js 18+ is installed
2. Install `@google/stitch-sdk` globally via npm
3. Add the `stitch-sdk` skill to Claude Code
4. Guide you through API key setup

### Manual Install

If you prefer to install step-by-step:

```bash
# 1. Install the SDK globally
npm install -g @google/stitch-sdk

# 2. Add the skill to Claude Code
claude skill add --source github:tomerhayundev/skills --skill stitch-sdk

# 3. Set your API key
export STITCH_API_KEY="your-api-key"
```

## Prerequisites

| Requirement | Version | How to Get |
|-------------|---------|------------|
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org) |
| **npm** | 8+ | Comes with Node.js |
| **Stitch API Key** | — | [stitch.withgoogle.com](https://stitch.withgoogle.com) |
| **Claude Code** | Latest | [claude.ai/claude-code](https://claude.ai/claude-code) |

## Getting Your API Key

1. Go to [stitch.withgoogle.com](https://stitch.withgoogle.com)
2. Sign in with your Google account
3. Go to your account settings and generate an API key
4. Copy the key

### Set it in your environment:

**macOS / Linux (bash/zsh):**
```bash
echo 'export STITCH_API_KEY="your-key-here"' >> ~/.bashrc
source ~/.bashrc
```

**Windows (PowerShell):**
```powershell
[System.Environment]::SetEnvironmentVariable('STITCH_API_KEY', 'your-key-here', 'User')
```

**Windows (CMD):**
```cmd
setx STITCH_API_KEY "your-key-here"
```

**Per-project `.env` (optional):**
```
STITCH_API_KEY=your-key-here
```

## What This Skill Does

This skill teaches Claude Code how to use the Stitch SDK to:

- **Generate UI screens** from text descriptions ("A login page with email and password")
- **Edit screens** iteratively ("Make the background dark, add a sidebar")
- **Create design variants** — explore different color schemes, layouts, fonts
- **Extract outputs** — get HTML download URLs and screenshot URLs
- **Build agent pipelines** — use the low-level Tool Client or Vercel AI SDK adapter

### Supported Workflows

| Workflow | Description |
|----------|-------------|
| **Prompt → Screen** | Generate a full UI from a text prompt |
| **Screen → Edit** | Refine a generated screen with follow-up prompts |
| **Screen → Variants** | Explore multiple design directions |
| **Agent Integration** | Wire Stitch into AI agent loops |
| **MCP Proxy** | Expose Stitch as an MCP server |

## Quick Start

Once installed, just ask Claude:

> "Create a dashboard with charts using Stitch"

Or use the SDK directly in your code:

```ts
import { stitch } from "@google/stitch-sdk";

const project = await stitch.createProject("My App");
const screen = await project.generate("A login page with email and password fields");
const html = await screen.getHtml();
const imageUrl = await screen.getImage();
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Your Code / Claude                    │
├──────────┬──────────────┬───────────────────────────────┤
│ Domain   │  Tool Client │  AI SDK Adapter               │
│ API      │  (MCP)       │  (Vercel AI)                  │
│          │              │                               │
│ stitch.  │ client.      │ stitchTools() →               │
│ create   │ callTool()   │ generateText({ tools: ... })  │
│ Project  │              │                               │
├──────────┴──────────────┴───────────────────────────────┤
│              Stitch MCP Server (googleapis.com)          │
├─────────────────────────────────────────────────────────┤
│              Gemini 3 Pro / Flash (generation)           │
└─────────────────────────────────────────────────────────┘
```

## SDK Versions

| Version | Status |
|---------|--------|
| 0.0.3 | Current — initial public release |

## Troubleshooting

### `StitchError: AUTH_FAILED`
Your API key is missing or invalid. Verify `STITCH_API_KEY` is set:
```bash
echo $STITCH_API_KEY
```

### `StitchError: RATE_LIMITED`
Too many requests. Wait a moment and retry. Consider reducing `variantCount` for variant generation.

### `StitchError: NETWORK_ERROR`
Can't reach the Stitch MCP server. Check your internet connection and any proxy/firewall settings.

### `getHtml()` returns a URL, not HTML
This is expected — `getHtml()` returns a **download URL**. Fetch it to get the actual HTML:
```ts
const htmlUrl = await screen.getHtml();
const response = await fetch(htmlUrl);
const html = await response.text();
```

### Module not found
Make sure you installed globally with `-g`:
```bash
npm install -g @google/stitch-sdk
```

Or for project-local use:
```bash
npm install @google/stitch-sdk
```

## Links

- [Stitch SDK on GitHub](https://github.com/google-labs-code/stitch-sdk)
- [Stitch SDK on npm](https://www.npmjs.com/package/@google/stitch-sdk)
- [Google AI Studio (API Keys)](https://aistudio.google.com/apikey)
- [Vercel AI SDK](https://sdk.vercel.ai/)

## License

This skill is MIT licensed. The Stitch SDK itself is Apache 2.0 licensed by Google.
