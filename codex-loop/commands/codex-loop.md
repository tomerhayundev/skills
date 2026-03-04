---
description: "Start a Codex Loop — iterative codex exec driven by Claude as orchestrator"
argument-hint: "PROMPT [--model MODEL] [--effort EFFORT] [--sandbox MODE] [--max-iterations N] [--completion-promise TEXT]"
allowed-tools: ["Bash(${CLAUDE_PLUGIN_ROOT}/scripts/setup-codex-loop.sh:*)"]
hide-from-slash-command-tool: "true"
---

# Codex Loop Command

Execute the setup script to initialize the Codex Loop:

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/setup-codex-loop.sh" $ARGUMENTS
```

You are the **orchestrator**. Codex is the coder. Your job each iteration:

1. **Run `codex exec`** using the model, effort, and sandbox settings stored in the state file
2. **Critically evaluate** Codex's output — treat it as a peer, not an authority. Push back if something is wrong.
3. **Verify the results** match the task requirements. Check files, run tests, inspect output.
4. **If the task is complete** and all criteria are genuinely met, output: `<promise>COMPLETION_PROMISE_HERE</promise>`
5. **Otherwise**, let yourself exit — the loop will feed you back automatically with the next iteration

CRITICAL RULES:
- Only output the promise when it is completely and unequivocally TRUE
- Do NOT output false promises to escape the loop
- Research disagreements with Codex using WebSearch before accepting its claims
- Codex can be wrong — trust your own knowledge
