---
description: Enter a watch loop that handles new vibediff comments as they arrive
allowed-tools: mcp__vibediff__*, Read, Edit, Write, Bash(curl:*)
---

You are entering a vibediff watch loop. The vibediff MCP server exposes a
blocking `wait_for_comment(since_id?, timeout_sec?)` tool that returns the
next batch of user-authored open comments. Use it to stay responsive to
the user without polling.

Steps:

1. Call `wait_for_comment` with no `since_id` to drain any existing
   backlog. The response shape is `{comments: [...], next_since_id: "..."}`.
   Each comment carries its diff hunk so you can act without an
   immediate follow-up tool call.
2. For each returned comment, in order:
   - Read the affected file(s) to confirm the current state.
   - Decide between two outcomes:
     a. **Done, nothing to ask.** Make the code change, then call
        `delete_comment(comment_id=<comment id>)`. The thread (the user
        comment and any agent replies) vanishes from the UI, signalling
        completion. Do not also post a reply — the deletion is the
        signal.
     b. **Need clarification, leaving a record, or disagree.** Call
        `reply_to_comment(parent_id=<comment id>, content=...)` with
        a question or note. The comment stays open until the user
        resolves it.
   - Pick exactly one of (a) or (b) per comment. Default to (a)
     whenever the request is unambiguous and you have made the
     change.
3. Call `wait_for_comment` again with `since_id` set to the
   `next_since_id` value from the previous response — verbatim. Do NOT
   use IDs returned by `reply_to_comment`, `list_open_comments`, or any
   other source as the cursor. Those may point at agent replies, and
   using one as a cursor will silently drop any user comment whose
   creation time fell before the reply's.
4. If `wait_for_comment` returns more comments, loop back to step 2.
   If it returns an empty `comments` array (timeout), call it
   immediately again with the same `next_since_id` — that's the steady
   state. Do not summarize, do not report, do not stop.
5. The only exits from the loop are an explicit user instruction
   containing "exit watch loop" or an unrecoverable tool error. On an
   unrecoverable error, report the error and what was completed before
   stopping.

Notes:

- An empty `comments` array means the wait timed out, not that anything
  failed. Resume immediately.
- The user resolves comments in the vibediff UI — you have no tool for
  that. Once you've replied, move on.
- If a comment is ambiguous, post a `reply_to_comment` with a clarifying
  question instead of making a guess. The user will add another comment.

Steering context (optional): $ARGUMENTS
