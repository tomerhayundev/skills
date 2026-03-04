#!/bin/bash

# Codex Loop Stop Hook
# Prevents session exit when a codex-loop is active
# Feeds the iteration prompt back to Claude with updated iteration count

set -euo pipefail

# JSON helper: JSON-encode a string (stdin → quoted JSON string)
json_encode_str() {
  if command -v node &>/dev/null; then
    printf '%s' "$1" | node -e "
      let d='';
      process.stdin.on('data',c=>d+=c);
      process.stdin.on('end',()=>process.stdout.write(JSON.stringify(d)));
    " 2>/dev/null
  elif command -v python3 &>/dev/null; then
    printf '%s' "$1" | python3 -c "import sys,json; sys.stdout.write(json.dumps(sys.stdin.read()))" 2>/dev/null
  elif command -v python &>/dev/null; then
    printf '%s' "$1" | python -c "import sys,json; sys.stdout.write(json.dumps(sys.stdin.read()))" 2>/dev/null
  else
    # Basic fallback: escape backslashes and double quotes only
    printf '"%s"' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  fi
}

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

# Get transcript path from hook input — use node/python instead of jq
TRANSCRIPT_PATH=""
if command -v node &>/dev/null; then
  TRANSCRIPT_PATH=$(printf '%s' "$HOOK_INPUT" | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try { console.log(JSON.parse(d).transcript_path||''); }
      catch { console.log(''); }
    });
  " 2>/dev/null) || true
elif command -v python3 &>/dev/null; then
  TRANSCRIPT_PATH=$(printf '%s' "$HOOK_INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('transcript_path',''))" 2>/dev/null) || true
elif command -v python &>/dev/null; then
  TRANSCRIPT_PATH=$(printf '%s' "$HOOK_INPUT" | python -c "import sys,json; print(json.load(sys.stdin).get('transcript_path',''))" 2>/dev/null) || true
else
  echo "⚠️  Codex Loop: No JSON parser available (jq, node, python3, or python required)" >&2
  echo "   Install jq: winget install jqlang.jq  OR ensure node/python is in PATH" >&2
  rm "$STATE_FILE"
  exit 0
fi

if [[ -z "$TRANSCRIPT_PATH" ]] || [[ ! -f "$TRANSCRIPT_PATH" ]]; then
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

# Parse assistant message content — use node/python instead of jq
LAST_OUTPUT=""
if command -v node &>/dev/null; then
  LAST_OUTPUT=$(printf '%s' "$LAST_LINE" | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try {
        const obj=JSON.parse(d);
        const content=(obj.message&&obj.message.content)||[];
        const texts=content.filter(x=>x.type==='text').map(x=>x.text);
        process.stdout.write(texts.join('\n'));
      } catch(e) {
        process.stderr.write('parse error: '+e.message+'\n');
        process.exit(1);
      }
    });
  " 2>/dev/null) || true
elif command -v python3 &>/dev/null; then
  LAST_OUTPUT=$(printf '%s' "$LAST_LINE" | python3 -c "
import sys, json
d = sys.stdin.read()
obj = json.loads(d)
content = obj.get('message', {}).get('content', [])
texts = [x['text'] for x in content if x.get('type') == 'text']
sys.stdout.write('\n'.join(texts))
" 2>/dev/null) || true
elif command -v python &>/dev/null; then
  LAST_OUTPUT=$(printf '%s' "$LAST_LINE" | python -c "
import sys, json
d = sys.stdin.read()
obj = json.loads(d)
content = obj.get('message', {}).get('content', [])
texts = [x['text'] for x in content if x.get('type') == 'text']
sys.stdout.write('\n'.join(texts))
" 2>/dev/null) || true
else
  echo "⚠️  Codex Loop: No JSON parser available (jq, node, python3, or python required)" >&2
  rm "$STATE_FILE"
  exit 0
fi

if [[ -z "$LAST_OUTPUT" ]]; then
  echo "⚠️  Codex Loop: Assistant message contained no text content" >&2
  echo "   Codex Loop is stopping." >&2
  rm "$STATE_FILE"
  exit 0
fi

# Check for completion promise
# Extract any <promise>...</promise> tag from the output
PROMISE_TEXT=$(echo "$LAST_OUTPUT" | perl -0777 -pe 's/.*?<promise>(.*?)<\/promise>.*/$1/s; s/^\s+|\s+$//g; s/\s+/ /g' 2>/dev/null || echo "")

if [[ "$COMPLETION_PROMISE" = "null" ]]; then
  # No explicit promise set — Claude can terminate by outputting <promise>null</promise>
  if [[ "$PROMISE_TEXT" = "null" ]]; then
    echo "✅ Codex Loop: Task marked complete by Claude"
    rm "$STATE_FILE"
    exit 0
  fi
elif [[ -n "$COMPLETION_PROMISE" ]]; then
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

# Block the stop and feed prompt back to Claude — use node/python instead of jq
PROMPT_JSON=$(json_encode_str "$PROMPT_TEXT")
MSG_JSON=$(json_encode_str "$SYSTEM_MSG")
printf '{"decision":"block","reason":%s,"systemMessage":%s}\n' "$PROMPT_JSON" "$MSG_JSON"

exit 0
