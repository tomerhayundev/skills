---
description: "Cancel active Codex Loop"
allowed-tools: ["Bash(test -f .claude/codex-loop.local.md:*)", "Bash(rm .claude/codex-loop.local.md)", "Read(.claude/codex-loop.local.md)"]
hide-from-slash-command-tool: "true"
---

# Cancel Codex Loop

To cancel the Codex Loop:

1. Check if `.claude/codex-loop.local.md` exists using Bash: `test -f .claude/codex-loop.local.md && echo "EXISTS" || echo "NOT_FOUND"`

2. **If NOT_FOUND**: Say "No active Codex Loop found."

3. **If EXISTS**:
   - Read `.claude/codex-loop.local.md` to get the current iteration number from the `iteration:` field
   - Remove the file using Bash: `rm .claude/codex-loop.local.md`
   - Report: "Cancelled Codex Loop (was at iteration N)" where N is the iteration value
