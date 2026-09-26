# codex-loop

A Claude Code plugin that runs `codex exec` iteratively across multiple iterations, using a Stop-hook loop engine to persist state and Claude to evaluate results each round.

**Claude orchestrates. Codex codes.**

```bash
claude plugin marketplace add https://github.com/tomerhayundev/skills.git
claude plugin install codex-loop@tomerhayundev-skills
```

---

## How It Works

```
User → /codex-loop "Build a REST API" --completion-promise "ALL TESTS PASSING"
         ↓
  setup-codex-loop.sh creates .claude/codex-loop.local.md
         ↓
  Claude runs: codex exec --skip-git-repo-check -m gpt-5.3-codex ... "Build a REST API"
         ↓
  Claude critically evaluates Codex's output
         ↓
  Claude tries to exit → stop-hook.sh intercepts
         ↓
  Hook checks: max iterations? promise detected? → if not → feeds prompt back
         ↓
  Claude receives next iteration with updated context
         ↓
  Repeat until <promise>ALL TESTS PASSING</promise> or max iterations
```

---

## Installation

### Prerequisites

1. **Claude Code**: [Install guide](https://code.claude.com/docs)
2. **Codex CLI**: install from [github.com/openai/codex](https://github.com/openai/codex):
   ```bash
   npm install -g @openai/codex
   ```
   Verify: `codex --version`

### Install the plugin

Add the marketplace (once per machine), then install:

```bash
claude plugin marketplace add https://github.com/tomerhayundev/skills.git
claude plugin install codex-loop@tomerhayundev-skills
```

Inside a Claude Code session the same steps are `/plugin marketplace add https://github.com/tomerhayundev/skills.git`
and `/plugin install codex-loop@tomerhayundev-skills`. The `tomerhayundev/skills` shorthand
clones over SSH, so use the HTTPS URL on a machine without a GitHub SSH key.

### Verify installation

```bash
claude plugin details codex-loop@tomerhayundev-skills
```

It should list three skills (`codex-loop`, `cancel-codex-loop`, `help`) and one Stop hook.
After restarting Claude Code (or `/reload-plugins`), `/codex-loop --help` prints the options.

If the commands don't show up, the plugin may be disabled:

```bash
claude plugin enable codex-loop@tomerhayundev-skills
```

### Update

codex-loop is versioned; a new version reaches you with:

```bash
claude plugin marketplace update tomerhayundev-skills
claude plugin update codex-loop@tomerhayundev-skills
```

### Gitignore the state file (recommended)

Add this to your `.gitignore` so the loop state file isn't committed:

```
.claude/codex-loop.local.md
```

---

## Usage

```bash
# Basic usage
/codex-loop "Build a REST API with CRUD and tests" --completion-promise "ALL TESTS PASSING"

# Full options
/codex-loop "Refactor the auth module" \
  --model gpt-5.3-codex \
  --effort high \
  --sandbox workspace-write \
  --max-iterations 20 \
  --completion-promise "AUTH REFACTOR COMPLETE"

# Read-only analysis
/codex-loop "Analyze this codebase for security vulnerabilities" \
  --sandbox read-only \
  --max-iterations 3 \
  --completion-promise "ANALYSIS DONE"

# Cancel at any time
/cancel-codex-loop
```

---

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--model` | `gpt-5.3-codex` | Codex model: `gpt-5.3-codex-spark`, `gpt-5.3-codex`, `gpt-5.2` |
| `--effort` | `high` | Reasoning effort: `xhigh`, `high`, `medium`, `low` |
| `--sandbox` | `workspace-write` | Sandbox: `read-only`, `workspace-write`, `danger-full-access` |
| `--max-iterations` | `10` | Max iterations before auto-stop (0 = unlimited) |
| `--completion-promise` | none | Phrase Claude must output inside `<promise>` tags to stop |

---

## Completion Promises

The loop stops when Claude outputs:

```
<promise>YOUR PROMISE HERE</promise>
```

Claude will **only** output this when the statement is completely and unequivocally true. The loop is designed to prevent false exits: Claude cannot lie to escape.

---

## State File

The loop state is stored in `.claude/codex-loop.local.md` (gitignored by default):

```yaml
---
active: true
iteration: 3
max_iterations: 20
completion_promise: "ALL TESTS PASSING"
codex_model: "gpt-5.3-codex"
codex_effort: "high"
codex_sandbox: "workspace-write"
started_at: "2026-03-04T12:00:00Z"
---

## Task
Build a REST API with CRUD and tests

## Codex Settings
...

## Your job each iteration
...
```

Monitor with: `head -15 .claude/codex-loop.local.md`

---

## Dual-AI Architecture

| Role | Model | Responsibility |
|------|-------|---------------|
| **Orchestrator** | Claude (Sonnet/Opus) | Run Codex, evaluate output, verify results, decide when done |
| **Coder** | Codex (OpenAI) | Write code, make file changes, implement features |

Claude treats Codex as a **peer, not an authority**:
- Pushes back when Codex claims something incorrect
- Researches disagreements using WebSearch
- Verifies results independently (runs tests, checks files)
- Never blindly accepts Codex's output

---

## Plugin Structure

```
codex-loop/
├── .claude-plugin/
│   └── plugin.json           # Manifest
├── commands/
│   ├── codex-loop.md         # /codex-loop slash command
│   ├── cancel-codex-loop.md  # /cancel-codex-loop command
│   └── help.md               # /help command
├── hooks/
│   ├── hooks.json            # Registers the Stop hook
│   └── stop-hook.sh          # Core loop engine
├── scripts/
│   └── setup-codex-loop.sh   # Arg parsing, state file creation
└── README.md
```

---

## Credits

- **Loop engine**: Adapted from [ralph-loop](https://github.com/anthropics/claude-plugins-official) by Anthropic
- **Codex integration**: Based on [skill-codex](https://github.com/tomerhayundev/skills)
- **Ralph technique**: Pioneered by [Geoffrey Huntley](https://ghuntley.com/ralph/)

---

## Author

[Tomer Hayun](https://github.com/tomerhayundev)
