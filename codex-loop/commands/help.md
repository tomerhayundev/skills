---
description: "Explain Codex Loop plugin and available commands"
---

# Codex Loop Plugin Help

Please explain the following to the user:

## What is Codex Loop?

Codex Loop combines two powerful patterns:
- **The Ralph Loop technique**: a Stop-hook-based self-referential loop that runs Claude iteratively until a task is complete
- **Codex CLI (`codex exec`)**: OpenAI's autonomous coding agent

**Core concept:** Claude acts as the **orchestrator and evaluator**, while Codex does the heavy coding. Each iteration:
1. Claude runs `codex exec` with the configured model, effort, and sandbox settings
2. Claude critically reviews Codex's output (treating it as a peer, not an authority)
3. Claude tries to exit
4. The Stop hook intercepts and feeds the same prompt back for the next iteration
5. Repeat until the completion promise is output or max iterations is reached

## Available Commands

### /codex-loop \<PROMPT\> [OPTIONS]

Start a Codex Loop in your current session.

**Usage:**
```
/codex-loop "Build a REST API with CRUD + tests" --completion-promise "ALL TESTS PASSING"
/codex-loop "Refactor the auth module" --model gpt-5.3-codex --effort high --max-iterations 15
/codex-loop "Fix all type errors" --sandbox workspace-write --max-iterations 10 --completion-promise "ZERO TYPE ERRORS"
```

**Options:**
- `--model <MODEL>` - Codex model: `gpt-5.3-codex-spark`, `gpt-5.3-codex`, `gpt-5.2` (default: `gpt-5.3-codex`)
- `--effort <EFFORT>` - Reasoning effort: `xhigh`, `high`, `medium`, `low` (default: `high`)
- `--sandbox <MODE>` - Sandbox mode: `read-only`, `workspace-write`, `danger-full-access` (default: `workspace-write`)
- `--max-iterations <n>` - Max iterations before auto-stop (default: 10)
- `--completion-promise <text>` - Promise phrase to signal completion (USE QUOTES for multi-word)

**How it works:**
1. Creates `.claude/codex-loop.local.md` state file with task + Codex settings
2. Claude runs `codex exec` and evaluates the output
3. When Claude tries to exit, the stop hook intercepts
4. Same prompt fed back, iteration incremented
5. Continues until promise detected or max iterations reached

---

### /cancel-codex-loop

Cancel an active Codex Loop (removes the loop state file).

**Usage:**
```
/cancel-codex-loop
```

---

## Key Concepts

### Completion Promises

To signal completion, Claude must output a `<promise>` tag:

```
<promise>ALL TESTS PASSING</promise>
```

The stop hook looks for this exact tag. Without it (or `--max-iterations`), the loop runs until max iterations.

### Dual-AI Architecture

Claude (Sonnet/Opus) + Codex work together:
- **Codex**: Writes the code, makes file changes
- **Claude**: Orchestrates, evaluates, fact-checks, decides when done

Claude treats Codex as a peer — pushes back when Codex is wrong, researches disagreements, and never blindly accepts Codex's output.

### State File

The loop state is stored in `.claude/codex-loop.local.md`. It contains:
- Task prompt and Codex settings
- Current iteration and max iterations
- Completion promise
- Instructions for Claude's role each iteration

To monitor: `head -15 .claude/codex-loop.local.md`

## Example

```
/codex-loop "Add comprehensive test coverage to the payment module" \
  --model gpt-5.3-codex \
  --effort high \
  --sandbox workspace-write \
  --max-iterations 20 \
  --completion-promise "COVERAGE ABOVE 90 PERCENT"
```

Claude will:
- Run `codex exec` to write tests
- Verify coverage actually exceeds 90%
- Push back if Codex makes incorrect assumptions
- Output `<promise>COVERAGE ABOVE 90 PERCENT</promise>` only when truly satisfied

## Learn More

- Original Ralph technique: https://ghuntley.com/ralph/
- Codex CLI docs: https://github.com/openai/codex
