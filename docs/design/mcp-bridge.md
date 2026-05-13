# Design Proposal: Vibediff ↔ Claude Code MCP Bridge

**Status:** Accepted (channel mode superseded by ADR 0001 — see
[`docs/adr/0001-replace-channel-push-with-watch-loop.md`](../adr/0001-replace-channel-push-with-watch-loop.md))
**Author:** Ryan Keepers
**Date:** 2026-05-13

## Summary

Wire vibediff directly to a running Claude Code session so review comments
flow into the agent and agent replies flow back into the vibediff UI,
removing the copy/paste step from the current workflow. Integration is
via an MCP (Model Context Protocol) server embedded in the vibediff
binary.

## Goals

- A user comment added in the vibediff UI is visible to a connected
  Claude Code session without copy/paste.
- Claude can post replies that render as threaded comments in the UI.
- Claude can act on comments (edit files) using its existing tools; the
  vibediff file watcher picks up the changes and refreshes the diff.
- The mapping between a vibediff instance and a Claude session is
  unambiguous and explicit.

## Non-goals

- Vibediff does not execute code edits itself. Claude does, via its own
  Edit/Write tools. Vibediff is the I/O surface only.
- Vibediff does not launch, supervise, or daemonize Claude. The user
  starts Claude in a terminal as today.
- No multi-agent fan-out. One vibediff is bound to one Claude session at
  a time.
- No persistence of comments across vibediff restarts (matches current
  behavior).

## Current state

- Comments live in-memory in `internal/review/store.go`. `Comment`
  carries `ID`, `File`, `Line`, `LineEnd`, `Side`, `Content`,
  `CreatedAt` — no author, no thread, no status, no revision anchor.
- HTTP API in `internal/handlers/handlers.go` exposes CRUD over
  comments. `GET /api/review/comments` returns all comments, with an
  optional `?file=` filter.
- A WebSocket hub in `internal/handlers/websocket.go` broadcasts
  file-change notifications to the browser; it does not process inbound
  messages.
- The file watcher (`internal/watcher/watcher.go`) already refreshes
  the UI on disk changes, so agent edits will reflect automatically.

## Delivery model

The driving requirement is that the user not have to copy/paste
comments or manually nudge Claude to look at vibediff. Three paths
support that goal, each opt-in:

### Watch-loop mode (long-poll, default for hands-off use)

Vibediff exposes a `wait_for_comment(since_id?, timeout_sec?)` MCP tool
that blocks server-side until a new user-authored open comment with
`ID > since_id` lands, then returns the batch. On timeout the tool
returns an empty array. Claude calls it in a loop:

1. `wait_for_comment` with no `since_id` to drain backlog.
2. For each returned comment, edit files, call `reply_to_comment`.
3. `wait_for_comment` again with `since_id` set to the last comment
   processed. Loop.

Claude enters the loop via the **`/vibediff-watch` slash command**,
typed once per session. See
[`docs/vibediff-watch-command.md`](../vibediff-watch-command.md). A
`SessionStart` hook was considered but does not eliminate the
keystroke — see ADR 0001.

This path supersedes channel mode (ADR 0001). It works on any Claude
Code install that permits MCP, including org-managed installs that
block `--channels`.

### MCP pull (agent-initiated, one-shot)

Claude calls `list_open_comments` when the user asks ("what's open in
vibediff") or as a step inside a larger task. The original `/vibediff`
slash command wraps this. Useful when you don't want a continuous
watch loop.

### Auto-pull hook (user-initiated, automatic)

Vibediff ships a `UserPromptSubmit` hook recipe in `docs/`. The user
installs it in their Claude Code settings. Whenever the user submits
any prompt in their Claude terminal, the hook fetches open comments
from vibediff and prepends them to the prompt context. The user never
types "check vibediff" and never copy/pastes. Orthogonal to whether
the MCP server is running.

### Copy/paste (today)

Existing workflow, unchanged. The "Copy Comments" button stays for
users who want none of the above.

## Proposed changes

### 1. Embed an MCP server in vibediff

A new `internal/mcp/` package runs alongside the HTTP server, started
from `main.go`, sharing the same `*review.Store`. Transport: HTTP,
served on a dedicated path of the existing port (e.g. `/mcp`).

The MCP server exposes:

**Tools**

- `list_open_comments` — return all comments with `status == "open"`.
  Each entry carries: file path (repo-relative), line range, side,
  content, author, parent ID, revision, commit, and an inlined diff
  hunk (see "Diff context inlining" below).
- `reply_to_comment(parent_id, content)` — append an agent-authored
  comment as a child of an existing comment.
- `get_full_hunk(comment_id)` — return the diff hunk for a single
  comment, in the same shape inlined by `list_open_comments`. Provides
  a way for the agent to re-fetch context for a specific comment
  without re-listing everything.
- `wait_for_comment(since_id?, timeout_sec?)` — block until a new
  user-authored open comment with `ID > since_id` exists, then return
  the batch in creation order. Returns immediately if a backlog is
  present. Returns an empty `comments` array on timeout (default 300s,
  cap 600s). Drives the watch-loop integration described above.

The agent does not have a tool to change comment status. Resolve is
strictly user-driven, performed in the vibediff UI.

**Diff context inlining**

Each comment in a response includes a `diffHunk` field carrying a
unified-diff hunk drawn from the comment's pinned commit:

- Hunk context is expanded to **25 lines of unchanged context on each
  side** of the changed lines (equivalent to `git diff -U25` / the jj
  equivalent).
- The standard diff header line (`@@ -a,b +c,d @@`) is included so
  the agent can orient against absolute line numbers.
- Both sides (`-` and `+` lines) are present, matching what the user
  saw in vibediff when commenting.
- A `truncated` boolean is reserved on the response shape for forward
  compatibility (e.g. a future hard cap) but is always `false` under
  current settings.
- A `drifted` boolean indicates whether the lines at the comment's
  anchor in current working copy differ from the lines at the same
  coordinates in `Commit`. Computed server-side at response time
  (not stored on the comment). The agent uses it to decide whether
  to acknowledge stale code in replies.

The `Side` metadata field is retained alongside `diffHunk` so the
agent still knows which side the user pointed at.

**Resources**

- `comments://open` — exposes the current set of open comments as a
  readable resource for `@`-mention or explicit `resources/read`.

**HTTP API additions**

- `GET /api/review/comments` — unchanged; returns all comments.
- `GET /api/review/comments/open` — returns comments with
  `status == "open"`.
- `GET /api/review/comments/resolved` — returns comments with
  `status == "resolved"`.
- `GET /api/review/comments/latest` — returns the single most recently
  created open comment, or 404 if there are no open comments. Intended
  for hook scripts that poll for new arrivals.

The hook recipe and any external integrations use these paths
directly. No new query parameters; subset paths only.

### 2. Comment model extensions

Add five fields to `review.Comment`. Defaults are applied server-side
in `Store.AddComment` so existing clients posting partial payloads
continue to work.

- `Author string` — `"user"` or `"agent"`. Default: `"user"`.
- `ParentID string` — set on replies, empty on top-level comments.
  Default: `""`.
- `Status string` — `"open"` or `"resolved"`. Default: `"open"`.
- `Revision string` — the backend-native identifier of the revision
  the comment was made against (jj change ID, git ref, or empty for
  working copy). Default: `""`.
- `Commit string` — the underlying commit SHA. Stable absolute
  reference for both git and jj backends. Default: `""`.

The existing HTTP endpoints continue to accept and return the extended
shape. Defaults make partial payloads from old clients still valid.
The frontend renders threaded replies and a per-comment status badge.
Revision and commit are displayed in the comment metadata so the
user can see which point-in-time the comment was made against.

Agent-authored comments are persisted by the MCP `reply_to_comment`
tool, which writes directly to `*review.Store` with `Author="agent"`
and `ParentID` set to the comment being replied to. It does not go
through `POST /api/review/comment`.

### 3. 1:1 session enforcement

Vibediff tracks at most one connected MCP client. A second client's
`initialize` request returns an error including an identifier or label
of the current holder. The lease is released on disconnect.

### 4. Targeting

Two pieces of configuration the user installs. They are
complementary, not alternatives.

- **`.mcp.json` in the repo the user is reviewing.** Claude Code's
  standard project-scoped MCP config, auto-loaded when `claude` runs
  in that directory. Vibediff ships an example snippet in `docs/`;
  the user drops it into whichever repo they want vibediff wired up
  in. This is what actually connects Claude to the MCP server.
- **`/vibediff` slash command.** Vibediff ships the command body at
  `docs/vibediff-command.md` and a Taskfile target `task
  install-command` that copies it to `~/.claude/commands/vibediff.md`
  (user scope, so it works in any repo the user reviews with
  vibediff). This is sugar over the HTTP API for explicit pulls.

  The command's behavior, in one file:

  - `description` frontmatter for `/help` discovery.
  - `allowed-tools: Bash(curl:*), Read, Edit, Write` so the agent can
    fetch comments and act on them without per-call permission
    prompts. Users with stricter posture can narrow the list.
  - Inline `!curl -sf http://localhost:8888/api/review/comments/open`
    to pull the open-comment list at command time. Hardcoded port;
    users on non-default ports edit the file once.
  - A framing prompt instructing Claude to address each open comment
    and use `reply_to_comment` to respond.
  - Trailing `$ARGUMENTS` substitution so the user can pass steering
    context (`/vibediff focus on the security comments`).

  No subcommands. The MCP resource `comments://open` and the raw HTTP
  endpoints remain available for users who want flavors beyond
  "open."

### 5. UI affordances

- A header indicator shows MCP connection state ("no agent connected"
  / "agent connected"), driven by whether an MCP client is currently
  connected.
- Agent replies render as threaded children of the parent comment,
  with a visual distinction (different bubble color or icon).
- Status badges per comment: open / resolved.

## Architecture sketch

```
┌──────────────────────┐         ┌──────────────────────┐
│  Vibediff binary     │         │  Claude Code (term)  │
│                      │         │                      │
│  ┌────────────────┐  │  MCP    │  ┌────────────────┐  │
│  │ MCP server     │◄─┼─────────┼─►│ MCP client     │  │
│  └───────┬────────┘  │         │  └────────────────┘  │
│          │           │         │          │           │
│  ┌───────▼────────┐  │         │  ┌───────▼────────┐  │
│  │ review.Store   │  │         │  │ Edit / Write   │  │
│  └───────▲────────┘  │         │  └───────┬────────┘  │
│          │           │         │          │           │
│  ┌───────┴────────┐  │  HTTP   │          │           │
│  │ HTTP API + WS  │◄─┼──┐      │          │           │
│  └────────────────┘  │  │      │          │           │
│  ┌────────────────┐  │  │      │          │           │
│  │ file watcher   │  │  │      │          │           │
│  └───────┬────────┘  │  │      │          │           │
└──────────┼───────────┘  │      └──────────┼───────────┘
           │              │                 │
           │              │                 ▼
           │              │           ┌───────────┐
           │              └───────────┤ Files on  │
           └──────────────────────────┤ disk      │
                  (notifies on        └───────────┘
                   file change)
```

## Risks and open questions

- **MCP client feature set (verified 2026-05-13).** Claude Code's MCP
  client supports stdio and HTTP transports (SSE is deprecated),
  `.mcp.json` project scope, and `list_changed` notifications for
  tools, prompts, and resources. It does **not** support resource
  content subscriptions. Mid-session server→client push exists only
  through the experimental `--channels` feature, which is blocked by
  org policy for the target user base; the watch-loop tool path
  replaces it (see ADR 0001).
- **Line-number drift.** If the user comments on line 42
  and the agent edits the file, the line number no longer points to
  the same code. The agent is shielded by the pinned-commit
  `diffHunk` — the original code is always visible regardless of
  working-copy state. A server-computed `drifted` boolean on each
  comment response signals the case so the agent's replies can
  acknowledge it. No UI handling in v1. Content-hash anchoring
  deferred to Future work.

## Rollout plan

1. Comment model extensions + UI changes (additive; ships
   independently of any MCP work).
2. New HTTP routes: `/api/review/comments/open`,
   `/comments/resolved`, `/comments/latest`. Cheap and unblocks the
   hook recipe.
3. Embedded MCP server with `list_open_comments`,
   `reply_to_comment`, `get_full_hunk`.
4. `.mcp.json` example shipped in `docs/`, dropped by the user into
   the repo they're reviewing.
5. `UserPromptSubmit` hook recipe in `docs/`.
6. `/vibediff` slash command shipped in `docs/vibediff-command.md`
   with a `task install-command` Taskfile target.

## Future work (v2+)

- **Content-hash anchored comments.** Anchor comments to a hash of
  the surrounding code, not just line numbers, so they survive
  subsequent edits.
- **Persist comments across vibediff restarts.**
- **Multi-repo / multi-instance coordination beyond 1:1.**
- **Cursor-based "since" endpoint.** Once channel-mode push lands,
  pair it with a `GET /api/review/comments/since/{id}` or similar so
  the agent can fetch only the comment that triggered a push.
