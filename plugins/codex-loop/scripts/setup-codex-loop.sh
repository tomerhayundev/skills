#!/bin/bash

# Codex Loop Setup Script
# Parses arguments, creates state file, and outputs the initial iteration prompt

set -euo pipefail

# Defaults
PROMPT_PARTS=()
MAX_ITERATIONS=10
COMPLETION_PROMISE="null"
CODEX_MODEL="gpt-5.3-codex"
CODEX_EFFORT="high"
CODEX_SANDBOX="workspace-write"

# Parse options and positional arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      cat << 'HELP_EOF'
Codex Loop - Iterative Codex CLI loop with Claude as orchestrator

USAGE:
  /codex-loop [PROMPT...] [OPTIONS]

ARGUMENTS:
  PROMPT...    Task description for Codex to work on (can be multiple words without quotes)

OPTIONS:
  --model <MODEL>                  Codex model to use (default: gpt-5.3-codex)
                                   Options: gpt-5.3-codex-spark, gpt-5.3-codex, gpt-5.2
  --effort <EFFORT>                Reasoning effort (default: high)
                                   Options: xhigh, high, medium, low
  --sandbox <MODE>                 Sandbox mode (default: workspace-write)
                                   Options: read-only, workspace-write, danger-full-access
  --max-iterations <n>             Max iterations before auto-stop (default: 10)
  --completion-promise '<text>'    Promise phrase (USE QUOTES for multi-word)
  -h, --help                       Show this help message

DESCRIPTION:
  Runs codex exec iteratively with Claude as the orchestrator/evaluator.
  Claude runs Codex, critically reviews the output, and loops until the
  completion promise is output or max iterations is reached.

EXAMPLES:
  /codex-loop Build a REST API with CRUD and tests --completion-promise 'ALL TESTS PASSING'
  /codex-loop Fix all type errors --max-iterations 10 --completion-promise 'ZERO TYPE ERRORS'
  /codex-loop Refactor the auth module --model gpt-5.3-codex --effort high --sandbox workspace-write
  /codex-loop Analyze this codebase --sandbox read-only --max-iterations 3

STOPPING:
  By reaching --max-iterations OR by Claude outputting <promise>YOUR_PHRASE</promise>

MONITORING:
  # View current iteration:
  grep '^iteration:' .claude/codex-loop.local.md

  # View full state:
  head -15 .claude/codex-loop.local.md

CANCELLING:
  /cancel-codex-loop
HELP_EOF
      exit 0
      ;;
    --model)
      if [[ -z "${2:-}" ]]; then
        echo "❌ Error: --model requires a model name" >&2
        echo "   Options: gpt-5.3-codex-spark, gpt-5.3-codex, gpt-5.2" >&2
        exit 1
      fi
      CODEX_MODEL="$2"
      shift 2
      ;;
    --effort)
      if [[ -z "${2:-}" ]]; then
        echo "❌ Error: --effort requires an effort level" >&2
        echo "   Options: xhigh, high, medium, low" >&2
        exit 1
      fi
      CODEX_EFFORT="$2"
      shift 2
      ;;
    --sandbox)
      if [[ -z "${2:-}" ]]; then
        echo "❌ Error: --sandbox requires a mode" >&2
        echo "   Options: read-only, workspace-write, danger-full-access" >&2
        exit 1
      fi
      CODEX_SANDBOX="$2"
      shift 2
      ;;
    --max-iterations)
      if [[ -z "${2:-}" ]]; then
        echo "❌ Error: --max-iterations requires a number argument" >&2
        echo "   Examples: --max-iterations 10   --max-iterations 0 (unlimited)" >&2
        exit 1
      fi
      if ! [[ "$2" =~ ^[0-9]+$ ]]; then
        echo "❌ Error: --max-iterations must be a positive integer or 0, got: $2" >&2
        exit 1
      fi
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --completion-promise)
      if [[ -z "${2:-}" ]]; then
        echo "❌ Error: --completion-promise requires a text argument" >&2
        echo "   Note: Multi-word promises must be quoted!" >&2
        echo "   Example: --completion-promise 'ALL TESTS PASSING'" >&2
        exit 1
      fi
      COMPLETION_PROMISE="$2"
      shift 2
      ;;
    *)
      PROMPT_PARTS+=("$1")
      shift
      ;;
  esac
done

# Join prompt parts
PROMPT="${PROMPT_PARTS[*]:-}"

# Validate prompt
if [[ -z "$PROMPT" ]]; then
  echo "❌ Error: No prompt provided" >&2
  echo "" >&2
  echo "   Codex Loop needs a task description." >&2
  echo "" >&2
  echo "   Examples:" >&2
  echo "     /codex-loop Build a REST API with CRUD and tests" >&2
  echo "     /codex-loop Fix all type errors --max-iterations 10" >&2
  echo "     /codex-loop --completion-promise 'DONE' Refactor cache layer" >&2
  echo "" >&2
  echo "   For all options: /codex-loop --help" >&2
  exit 1
fi

# Create state file
mkdir -p .claude

# Quote completion promise for YAML if not null
if [[ -n "$COMPLETION_PROMISE" ]] && [[ "$COMPLETION_PROMISE" != "null" ]]; then
  COMPLETION_PROMISE_YAML="\"$COMPLETION_PROMISE\""
else
  COMPLETION_PROMISE_YAML="null"
fi

# Determine sandbox flag
case "$CODEX_SANDBOX" in
  read-only)            SANDBOX_FLAGS="--sandbox read-only" ;;
  workspace-write)      SANDBOX_FLAGS="--sandbox workspace-write --full-auto" ;;
  danger-full-access)   SANDBOX_FLAGS="--sandbox danger-full-access --full-auto" ;;
  *)                    SANDBOX_FLAGS="--sandbox workspace-write --full-auto" ;;
esac

# Build the codex command (stored for Claude to use each iteration)
CODEX_CMD="codex exec --skip-git-repo-check -m $CODEX_MODEL --config model_reasoning_effort=\"$CODEX_EFFORT\" $SANDBOX_FLAGS 2>/dev/null"

cat > .claude/codex-loop.local.md <<EOF
---
active: true
iteration: 1
max_iterations: $MAX_ITERATIONS
completion_promise: $COMPLETION_PROMISE_YAML
codex_model: "$CODEX_MODEL"
codex_effort: "$CODEX_EFFORT"
codex_sandbox: "$CODEX_SANDBOX"
started_at: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
---

## Task
$PROMPT

## Codex Settings
- Model: $CODEX_MODEL
- Effort: $CODEX_EFFORT
- Sandbox: $CODEX_SANDBOX
- Command: \`$CODEX_CMD "<your prompt here>"\`

## Your job each iteration
1. Run Codex using Bash with this command (replace the prompt as needed for the task):
   \`\`\`bash
   $CODEX_CMD "$PROMPT"
   \`\`\`
2. Critically evaluate Codex's output — treat it as a peer, not an authority:
   - Push back if Codex claims something you know is incorrect
   - Research disagreements using WebSearch before accepting Codex's claims
   - Remember Codex has a knowledge cutoff and can be wrong about recent APIs/versions
3. Verify the task requirements are actually met (run tests, inspect files, check output)
4. If the task is complete and all criteria are genuinely met, output:
   <promise>$COMPLETION_PROMISE</promise>
5. Otherwise let yourself exit — you will be looped back automatically

CRITICAL: Only output the promise when it is completely and unequivocally TRUE.
Do not output false promises to escape the loop, even if you think you're stuck.
EOF

# Output setup message
cat <<EOF
🔄 Codex Loop activated!

Task: $PROMPT
Model: $CODEX_MODEL
Effort: $CODEX_EFFORT
Sandbox: $CODEX_SANDBOX
Iteration: 1 / $(if [[ $MAX_ITERATIONS -gt 0 ]]; then echo $MAX_ITERATIONS; else echo "unlimited"; fi)
Completion promise: $(if [[ "$COMPLETION_PROMISE" != "null" ]]; then echo "${COMPLETION_PROMISE} (ONLY output when TRUE!)"; else echo "none (runs until max iterations)"; fi)

The stop hook is now active. Each time you try to exit, the same task
will be fed back to you for the next iteration — until the promise is
output or max iterations is reached.

To monitor: head -15 .claude/codex-loop.local.md
To cancel: /cancel-codex-loop

EOF

# Output the iteration prompt
echo "## Task"
echo "$PROMPT"
echo ""
echo "## Your job this iteration"
echo "1. Run Codex with: \`$CODEX_CMD \"$PROMPT\"\`"
echo "2. Critically evaluate Codex's output"
echo "3. Verify the task requirements are actually met"
if [[ "$COMPLETION_PROMISE" != "null" ]]; then
  echo "4. If complete and all criteria are genuinely met, output:"
  echo "   <promise>$COMPLETION_PROMISE</promise>"
  echo "   (ONLY when this is completely and unequivocally TRUE)"
  echo "5. Otherwise let yourself exit — you will be looped back"
else
  echo "4. Let yourself exit when done — loop will continue until max iterations"
fi

# Completion promise section
if [[ "$COMPLETION_PROMISE" != "null" ]]; then
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "CRITICAL - Codex Loop Completion Promise"
  echo "═══════════════════════════════════════════════════════════"
  echo ""
  echo "To complete this loop, output this EXACT text:"
  echo "  <promise>$COMPLETION_PROMISE</promise>"
  echo ""
  echo "STRICT REQUIREMENTS:"
  echo "  ✓ Use <promise> XML tags EXACTLY as shown above"
  echo "  ✓ The statement MUST be completely and unequivocally TRUE"
  echo "  ✓ Do NOT output false statements to exit the loop"
  echo "  ✓ Do NOT lie even if you think you should exit"
  echo "═══════════════════════════════════════════════════════════"
fi
