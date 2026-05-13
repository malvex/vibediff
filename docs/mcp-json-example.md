# Wiring Claude Code to vibediff (`.mcp.json`)

Drop this file at the root of whichever repo you want to review with
vibediff. Claude Code auto-loads it when you launch `claude` in that
directory.

```json
{
  "mcpServers": {
    "vibediff": {
      "type": "http",
      "url": "http://localhost:8888/mcp"
    }
  }
}
```

The file is intended to be committed so the rest of your team gets the
same wiring for free.

## Customizations

- Change the port if you started vibediff with `-port`.
- If you want the MCP server available everywhere without copying this
  file into each repo, add the same entry to `~/.claude.json` under the
  `mcpServers` key (user scope).

## Launching Claude

```bash
claude --channels server:vibediff
```

Vibediff is a channels-only integration. When you add a comment in the
UI, vibediff emits a `notifications/claude/channel` event to the
connected Claude session; Claude wraps it in `<channel
source="vibediff">` and acts on it on the next turn — or immediately
if Claude is idle.

Requirements:

- Claude Code v2.1.80 or later.
- Your org's Claude Code policy must permit `--channels` (managed
  installs sometimes block it). If you see `--channels blocked by org
  policy`, contact your admin.

For the full walkthrough including verification, the channel-event
wire format, and troubleshooting, see
[`channel-setup.md`](./channel-setup.md).

## What this gives you

Once Claude Code is launched with this config and `vibediff` is running:

- **Push.** New user comments wake the Claude session via
  `notifications/claude/channel`.
- `list_open_comments` — the agent can fetch all currently open
  comments, each with its pinned-commit diff hunk.
- `reply_to_comment` — agent replies appear threaded under the user
  comment in the vibediff UI.
- `get_full_hunk` — agent can re-fetch the diff hunk for a single
  comment.
- `comments://open` — `@`-mentionable resource.

Status changes (resolve / reopen) are not on the tool surface. Resolve
is user-driven through the vibediff UI.
