# ADR 0001: Replace channel push with watch-loop long-poll

**Status:** Proposed
**Date:** 2026-05-14

## Context

The MCP bridge between vibediff and Claude Code shipped with three
delivery paths (see `docs/design/mcp-bridge.md`): channel-mode push,
MCP pull, and a `UserPromptSubmit` hook. Channel mode was the only
true push path — the user adds a comment in the browser and a running
Claude session receives it without the user touching the terminal.

Channel mode relies on Claude Code's experimental `--channels` feature.
Org-managed Claude Code installs block `--channels` (or restrict it
via an allowlist that vibediff cannot satisfy). For the target user
base this means the only true-push path is undeliverable.

The remaining paths (`/vibediff` slash command, `UserPromptSubmit`
hook) require the user to type a prompt in the Claude terminal for
new comments to be picked up. That defeats the original goal: a user
comments in the browser, Claude acts without a terminal context-switch.

## Decision

Replace channel push with an agent-driven long-poll loop. Concretely:

1. Add MCP tool `wait_for_comment(since_id?: string, timeout_sec?: int)`.
   - Returns a batch of user-authored, status-open comments with
     `ID > since_id`, in creation order, each carrying its diff hunk.
   - Returns immediately if a backlog exists.
   - Otherwise blocks server-side until a matching comment lands or
     the timeout expires.
   - On timeout: returns `comments: []` (not an error). Claude re-calls.
   - Default `timeout_sec` 300, server-capped at 600.
2. Wake events match channel-mode filter: new `Author=user` comments
   only. Re-opens, resolves, agent replies, deletes do not wake.
3. Server-side wait uses **durable subscribers** on `review.Store`.
   `Subscribe` returns an unsubscribe function; AddComment fans out
   to every active subscriber. The `wait_for_comment` handler
   subscribes per call and unsubscribes via defer. The handler does
   `subscribe → check backlog → wait → re-query → unsubscribe`; the
   pre-wait backlog check closes the registration race. Durable
   subscribers also let the WebSocket hub register once at startup
   so the UI re-fetches comments whenever an agent reply (or any
   server-side write) lands.
4. Claude enters the watch loop via the **`/vibediff-watch` slash
   command** — explicit invocation typed once at the start of a
   Claude session. Shipped alongside the existing `/vibediff` (which
   stays as one-shot pull). A `SessionStart` hook was considered and
   rejected — it can pre-load the prompt body into context but cannot
   trigger autonomous action without a turn boundary, so it does not
   save the user a keystroke. See Consequences.
5. Hard delete the channel path: experimental capability declaration
   in `internal/mcp/server.go`, `onCommentAdded`,
   `formatChannelMessage`, `SendNotificationToAllClients` call.
   `docs/channel-setup.md` removed. README channel copy replaced
   with watch-loop copy. `docs/design/mcp-bridge.md` updated.

## Alternatives considered

- **Claude-side `/loop 30s /vibediff` poller.** Re-invokes a slash
  command every N seconds. Rejected: every tick is a fresh turn even
  when nothing changed, burning prompt cache and context. No idle wait.
- **Keep channels alongside the watch loop.** Soft-retain path lets
  a future org-policy reversal flip channels back on. Rejected:
  maintenance tax for code that runs for no one in the current target
  population; the experimental protocol contract is still moving and
  vibediff would carry the churn without users.
- **External scheduler (cron, systemd timer, claude routines).**
  Wraps short polls of `/api/review/comments/latest` and pipes into
  claude. Rejected: same turn-churn problem as `/loop`, plus
  per-user infrastructure setup.

## Consequences

**Positive**

- Works on any Claude Code install that permits MCP at all. No
  dependence on the experimental `--channels` flag or its allowlist.
- Idle Claude parks in one blocking tool call: zero turn churn, zero
  prompt cache invalidation when nothing is happening.
- `since_id` cursor is stateless server-side. Survives MCP
  reconnects. Survives vibediff restart for the duration the cursor
  is still meaningful (comments are in-memory, so a vibediff restart
  invalidates the comment IDs anyway).
- The tool surface stays small: `list_open_comments`,
  `reply_to_comment`, `get_full_hunk`, `wait_for_comment`.

**Negative**

- An MCP session that is "blocked in `wait_for_comment`" looks idle
  from outside. A user inspecting `/mcp` or vibediff logs sees a
  long-lived connection doing nothing. Documented in setup notes.
- No protocol-level push means a future feature wanting to notify
  Claude about non-comment events (e.g. user resolves a thread, file
  changed externally) has no transport. Add a separate
  `wait_for_event` tool when that lands; do not retrofit
  `wait_for_comment`.
- Re-adding channel push later means picking a transport again and
  re-threading every consumer wired around polling.
- **One-keystroke gap.** Watch mode is not truly zero-touch. Claude
  Code does not generate a response without a user turn boundary, so
  entering the watch loop requires the user to type `/vibediff-watch`
  once per session. A `SessionStart` hook can pre-load the watch
  prompt body into context but cannot itself trigger Claude to call
  `wait_for_comment` — it only saves the user from typing the
  command body, not from sending a turn. Channel push was the only
  mechanism that would have closed this gap and it is unavailable.

## Notes

The watch loop relies on Claude actually calling `wait_for_comment` in
a loop. If the prompt priming (hook or slash command) fails to land,
the agent silently degrades to pull-mode behavior — the tool is there
but nobody calls it. The setup guide should call this out and offer a
smoke test (add a comment, watch for the tool call in vibediff debug
logs).
