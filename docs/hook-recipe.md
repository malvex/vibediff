# UserPromptSubmit hook recipe

The recommended way to keep Claude Code's context fresh without typing
`/vibediff` every turn: install a `UserPromptSubmit` hook that injects
open comments on every prompt you submit.

Add this to `~/.claude/settings.json` (or merge into your existing
config):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -sf http://localhost:8888/api/review/comments/open 2>/dev/null || true"
          }
        ]
      }
    ]
  }
}
```

Whenever you submit a prompt in your Claude terminal, the hook runs the
curl, and the JSON it returns is prepended to your prompt as context.
If vibediff isn't running, the `|| true` makes the hook silently
no-op so it doesn't block your prompt.

## When to use this vs `/vibediff`

- **Hook**: passive. Every prompt you submit picks up the current open
  comments. Best when you're going back and forth with the agent and
  want it to always know what's pending.
- **`/vibediff`**: explicit. You type it when you want to engage with
  comments specifically. Best when you don't want comments injected on
  every unrelated prompt.

The two are not mutually exclusive — install both if you want.

## Customization

- Change the port if you started vibediff with `-port`.
- Swap the endpoint for `/comments/latest` if you'd rather only see the
  most recent open comment.
- Add `jq` post-processing if you want to filter the JSON further
  before it lands in your context.

## Caveats

- The hook hits HTTP, not MCP, so it works whether or not the MCP
  server is connected.
- Comment payloads include the full diff hunk (±25 lines context). On
  large open-comment sets, every prompt's context grows accordingly.
