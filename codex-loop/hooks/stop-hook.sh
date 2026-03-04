#!/bin/bash

# Codex Loop Stop Hook
# Prevents session exit when a codex-loop is active
# Feeds the iteration prompt back to Claude with updated iteration count

set -euo pipefail

# Read hook input from stdin (advanced stop hook API)
HOOK_INPUT=$(cat)

# Check if codex-loop is active
STATE_FILE=".claude/codex-loop.local.md"

if [[ ! -f "$STATE_FILE" ]]; then
  # No active loop - allow exit
  exit 0
fi

# Parse markdown frontmatter (YAML between ---) and extract values
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$STATE_FILE")
ITERATION=$(echo "$FRONTMATTER" | grep '^iteration:' | sed 's/iteration: *//')
MAX_ITERATIONS=$(echo "$FRONTMATTER" | grep '^max_iterations:' | sed 's/max_iterations: *//')
COMPLETION_PROMISE=$(echo "$FRONTMATTER" | grep '^completion_promise:' | sed 's/completion_promise: *//' | sed 's/^"\(.*\)"$/\1/')
CODEX_MODEL=$(echo "$FRONTMATTER" | grep '^codex_model:' | sed 's/codex_model: *//' | sed 's/^"\(.*\)"$/\1/')
CODEX_EFFORT=$(echo "$FRONTMATTER" | grep '^codex_effort:' | sed 's/codex_effort: *//' | sed 's/^"\(.*\)"$/\1/')
CODEX_SANDBOX=$(echo "$FRONTMATTER" | grep '^codex_sandbox:' | sed 's/codex_sandbox: *//' | sed 's/^"\(.*\)"$/\1/')

# Validate numeric fields
if [[ ! "$ITERATION" =~ ^[0-9]+$ ]]; then
  echo "⚠️  Codex Loop: State file corrupted" >&2
  echo "   File: $STATE_FILE" >&2
  echo "   Problem: 'iteration' field is not a valid number (got: '$ITERATION')" >&2
  echo "   Codex Loop is stopping. Run /codex-loop again to start fresh." >&2
  rm "$STATE_FILE"
  exit 0
fi

if [[ ! "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
  echo "⚠️  Codex Loop: State file corrupted" >&2
  echo "   File: $STATE_FILE" >&2
  echo "   Problem: 'max_iterations' field is not a valid number (got: '$MAX_ITERATIONS')" >&2
  echo "   Codex Loop is stopping. Run /codex-loop again to start fresh." >&2
  rm "$STATE_FILE"
  exit 0
fi

# Check if max iterations reached
if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
  echo "🛑 Codex Loop: Max iterations ($MAX_ITERATIONS) reached."
  rm "$STATE_FILE"
  exit 0
fi

# Get transcript path from hook input
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path')

if [[ ! -f "$TRANSCRIPT_PATH" ]]; then
  echo "⚠️  Codex Loop: Transcript file not found" >&2
  echo "   Expected: $TRANSCRIPT_PATH" >&2
  echo "   Codex Loop is stopping." >&2
  rm "$STATE_FILE"
  exit 0
fi

# Check for assistant messages in transcript
if ! grep -q '"role":"assistant"' "$TRANSCRIPT_PATH"; then
  echo "⚠️  Codex Loop: No assistant messages found in transcript" >&2
  echo "   Codex Loop is stopping." >&2
  rm "$STATE_FILE"
  exit 0
fi

# Extract last assistant message
LAST_LINE=$(grep '"role":"assistant"' "$TRANSCRIPT_PATH" | tail -1)
if [[ -z "$LAST_LINE" ]]; then
  echo "⚠️  Codex Loop: Failed to extract last assistant message" >&2
  echo "   Codex Loop is stopping." >&2
  rm "$STATE_FILE"
  exit 0
fi

# Parse JSON with error handling
LAST_OUTPUT=$(echo "$LAST_LINE" | jq -r '
  .message.content |
  map(select(.type == "text")) |
  map(.text) |
  join("\n")
' 2>&1)

if [[ $? -ne 0 ]]; then
  echo "⚠️  Codex Loop: Failed to parse assistant message JSON" >&2
  echo "   Error: $LAST_OUTPUT" >&2
  echo "   Codex Loop is stopping." >&2
  rm "$STATE_FILE"
  exit 0
fi

if [[ -z "$LAST_OUTPUT" ]]; then
  echo "⚠️  Codex Loop: Assistant message contained no text content" >&2
  echo "   Codex Loop is stopping." >&2
  rm "$STATE_FILE"
  exit 0
fi

# Check for completion promise (only if set)
if [[ "$COMPLETION_PROMISE" != "null" ]] && [[ -n "$COMPLETION_PROMISE" ]]; then
  PROMISE_TEXT=$(echo "$LAST_OUTPUT" | perl -0777 -pe 's/.*?<promise>(.*?)<\/promise>.*/$1/s; s/^\s+|\s+$//g; s/\s+/ /g' 2>/dev/null || echo "")

  if [[ -n "$PROMISE_TEXT" ]] && [[ "$PROMISE_TEXT" = "$COMPLETION_PROMISE" ]]; then
    echo "✅ Codex Loop: Detected <promise>$COMPLETION_PROMISE</promise>"
    rm "$STATE_FILE"
    exit 0
  fi
fi

# Not complete - continue loop
NEXT_ITERATION=$((ITERATION + 1))

# Extract the full prompt body (everything after the closing ---)
PROMPT_TEXT=$(awk '/^---$/{i++; next} i>=2' "$STATE_FILE")

if [[ -z "$PROMPT_TEXT" ]]; then
  echo "⚠️  Codex Loop: State file corrupted — no prompt text found" >&2
  echo "   File: $STATE_FILE" >&2
  echo "   Codex Loop is stopping. Run /codex-loop again to start fresh." >&2
  rm "$STATE_FILE"
  exit 0
fi

# Update iteration counter
TEMP_FILE="${STATE_FILE}.tmp.$$"
sed "s/^iteration: .*/iteration: $NEXT_ITERATION/" "$STATE_FILE" > "$TEMP_FILE"
mv "$TEMP_FILE" "$STATE_FILE"

# Build system message
if [[ "$COMPLETION_PROMISE" != "null" ]] && [[ -n "$COMPLETION_PROMISE" ]]; then
  SYSTEM_MSG="🔄 Codex Loop iteration $NEXT_ITERATION | Model: $CODEX_MODEL | Effort: $CODEX_EFFORT | Sandbox: $CODEX_SANDBOX | To stop: output <promise>$COMPLETION_PROMISE</promise> (ONLY when TRUE)"
else
  SYSTEM_MSG="🔄 Codex Loop iteration $NEXT_ITERATION | Model: $CODEX_MODEL | Effort: $CODEX_EFFORT | Sandbox: $CODEX_SANDBOX | No completion promise — loop until max iterations"
fi

# Block the stop and feed prompt back to Claude
jq -n \
  --arg prompt "$PROMPT_TEXT" \
  --arg msg "$SYSTEM_MSG" \
  '{
    "decision": "block",
    "reason": $prompt,
    "systemMessage": $msg
  }'

exit 0
