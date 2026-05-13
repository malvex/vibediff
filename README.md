# VibeDiff

A local Git/Jujutsu diff viewer that runs entirely on your machine. Review your code changes comfortably before committing or pushing.

![VibeDiff screenshot](https://github.com/user-attachments/assets/cc2bf145-4b0c-4b94-9322-df27a11b3e94)

## Why VibeDiff?

- **🏠 Runs Locally**: Single Go binary starts a web server on your machine - no cloud services, no data leaves your computer
- **🔄 Live File Watching**: Automatically updates the diff view as files change - see your edits in real-time
- **💬 AI-Friendly Reviews**: Add review comments to your code, then copy/export them as markdown to paste into AI assistants
- **🚀 Pre-Commit Workflow**: Review and annotate your changes before committing, ensuring higher quality commits
- **⚡ Zero Setup**: Just run the binary in any Git or Jujutsu repository - no configuration needed

## Features

- 🎨 GitHub-like diff visualization with syntax highlighting (PrismJS)
- 📁 View all changes, staged changes, or unstaged changes
- 🔀 Side-by-side and unified diff view modes
- 💬 Inline code review comments with range selection (click and drag across lines)
- 📋 Copy review comments as markdown for AI workflows
- 🔄 Real-time updates via WebSocket when files change
- ⚡ Single binary distribution with embedded web assets
- 🌓 Dark mode support with automatic theme detection
- 🔍 View full files with diff context highlighting, expandable context around hunks
- 📱 Responsive design with resizable sidebar and collapsible file tree
- 📂 Directory switcher - review multiple repos without restarting
- 📜 Revision/commit history browsing in the sidebar
- ✅ Mark files as reviewed with content-aware tracking (marks clear when files change)
- ⌨️ Keyboard shortcuts for navigation (j/k, r to toggle reviewed, ? for help)
- 🔧 Supports both Git and Jujutsu (jj) repositories
- 📌 Sticky file diff headers for easy navigation
- 🤖 Embedded MCP server: Claude Code can read comments, post threaded replies, and act on them without copy/paste
- 📡 Watch-loop mode: a long-poll MCP tool parks Claude inside `wait_for_comment`; new UI comments wake it without any further terminal input
- 🧵 Threaded comments with author badges (user / agent) and status (open / resolved)
- 📍 Comments pinned to the revision and commit SHA they were made against

## Installation

### Build From Source

```bash
git clone https://github.com/meain/vibediff.git
cd vibediff
task build
# Binary will be created as ./vibediff
```

## Usage

### Basic Workflow

1. **Start VibeDiff** in your Git or Jujutsu repository:
   ```bash
   vibediff
   ```

2. **Review your changes** in the browser - the diff updates automatically as you edit files

3. **Add review comments** by clicking the `+` button on any line, or click and drag to comment on a range of lines

4. **Copy comments** using the "Copy Comments" button to get markdown-formatted review notes for AI assistants or team discussions

### AI-Powered Workflow (copy/paste)

The original flow, still available for users who don't want any MCP wiring:

1. **Review and annotate** your changes in VibeDiff
2. **Copy comments** as markdown using the copy button
3. **Paste into your AI assistant** with instructions to implement the changes
4. **Re-run VibeDiff** to verify the AI's changes and iterate

### Claude Code Integration (MCP)

VibeDiff also embeds a Model Context Protocol (MCP) server so Claude Code
can read open comments, post threaded replies, and re-fetch diff hunks
without you ever copy/pasting. The user comments in the browser; the
agent reads them in the terminal. Agent replies appear threaded under
the original comment in the UI.

#### Setup (one-time)

1. **Wire Claude to VibeDiff.** Drop a `.mcp.json` at the root of the
   repo you want to review. See `docs/mcp-json-example.md` for the
   exact contents — minimally:

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

   Commit this file so your team gets the same wiring.

2. **(Optional) Install the `/vibediff` slash command.** From the
   VibeDiff repo:

   ```bash
   task install-command
   ```

   This copies `docs/vibediff-command.md` to
   `~/.claude/commands/vibediff.md`. Typing `/vibediff` in a Claude
   session pulls open comments and frames a fix-pass prompt.

3. **(Optional) Install the `/vibediff-watch` slash command.** For
   watch mode — Claude parks in a `wait_for_comment` long-poll and
   reacts to new UI comments without further prompting:

   ```bash
   task install-watch-command
   ```

   This copies `docs/vibediff-watch-command.md` to
   `~/.claude/commands/vibediff-watch.md`. Type `/vibediff-watch` at
   the start of a Claude session to enter the watch loop.

4. **(Optional) Install the auto-pull hook.** If you want open
   comments injected into Claude's context on every prompt you submit
   — no `/vibediff` typing needed — follow `docs/hook-recipe.md` to
   add a `UserPromptSubmit` hook to `~/.claude/settings.json`.

The two slash commands and the auto-pull hook are independent.
Install whichever combination fits your workflow.

#### Day-to-day loop

1. **Start VibeDiff** in the repo you're reviewing:
   ```bash
   vibediff
   ```

2. **Launch Claude** in the same repo (a separate terminal):

   ```bash
   claude
   ```

   Run `/mcp` inside Claude to confirm `vibediff` shows as connected.

3. **(Watch mode)** Type `/vibediff-watch` to enter the watch loop.
   Claude calls `wait_for_comment` and parks. From this point on, new
   UI comments wake Claude with no further terminal input. Skip this
   step if you'd rather drive comment review with `/vibediff` on
   demand.

4. **Add a comment** in the VibeDiff browser tab (click `+` on a line
   or drag across a range).

5. **Engage the agent.** Depends on whether you entered watch mode:
   - **Watch mode** (`/vibediff-watch` already typed): no action
     required. Claude is parked in `wait_for_comment`; your new
     comment wakes it and it acts on the next turn.
   - **Pull mode** (no `/vibediff-watch`): type `/vibediff`
     (optionally with steering context like
     `/vibediff focus only on the security comments`), submit any
     prompt if you installed the `UserPromptSubmit` hook, or ask
     explicitly: "what's open in vibediff?"

6. **Refresh VibeDiff.** Agent replies appear as threaded children of
   your original comment with an `Agent` badge. The agent's code edits
   are picked up by the file watcher and the diff view refreshes.

7. **Resolve.** Click ✓ on the parent comment to mark the thread
   resolved. Click ↺ to reopen. **Resolution is user-only** — the agent
   has no tool to flip status.

#### What's on the wire

The MCP server exposes:

- **Tools**
  - `list_open_comments` — every open comment, each with its
    pinned-commit diff hunk (±25 lines of unchanged context) and a
    `drifted` flag if the working copy has changed at the anchor.
  - `reply_to_comment(parent_id, content)` — append an agent reply.
    Use when you have a question, are leaving a record, or disagree.
  - `delete_comment(comment_id)` — remove a thread (root + replies)
    after acting on the request. Default outcome for unambiguous
    comments the agent has completed — the user sees the comment
    vanish.
  - `get_full_hunk(comment_id)` — re-fetch the hunk for one comment.
  - `wait_for_comment(since_id?, timeout_sec?)` — block until a new
    user-authored open comment lands with `ID > since_id`, then return
    the batch. Returns an empty array on timeout. Drives watch mode.
- **Resources**
  - `comments://open` — readable via `@`-mention or `resources/read`.

#### HTTP endpoints (used by the hook recipe and external scripts)

- `GET /api/review/comments` — all comments
- `GET /api/review/comments/open` — comments with `status=open`
- `GET /api/review/comments/resolved` — comments with `status=resolved`
- `GET /api/review/comments/latest` — single most recently created open
  comment, or 404 if none
- `POST /api/review/comment/{id}/resolve` — mark resolved (user UI)
- `POST /api/review/comment/{id}/reopen` — reopen (user UI)

#### Smoke test (skip Claude)

Verify the MCP server is reachable:

```bash
curl -s -X POST http://localhost:8888/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json,text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}'
```

Should return a JSON-RPC result with
`serverInfo: {"name":"vibediff","version":"0.1.0"}`.

Add a comment in the UI, then:

```bash
curl -s http://localhost:8888/api/review/comments/open
```

You should see the comment as JSON.

#### Troubleshooting

- **`/mcp` in Claude shows no servers, or vibediff disconnected.**
  Check `.mcp.json` is at the repo root and points at the right port.
  Confirm vibediff is running. Try `vibediff -debug` for verbose logs.
- **Second `claude` session refuses to connect to MCP.** That's the
  1:1 enforcement — only one Claude session per VibeDiff at a time.
  Restart vibediff to clear the slot.
- **Empty `diffHunk` in tool results.** No hunk overlaps the comment's
  line range, or the underlying `git diff` / `jj diff` call failed.
  Verify the commit the comment was pinned to is still reachable.
- **Watch mode specifically.** See
  [`docs/vibediff-watch-command.md`](docs/vibediff-watch-command.md)
  for the watch-loop prompt body. Watch mode requires a single
  `/vibediff-watch` invocation per session — Claude Code does not
  trigger autonomous action without a turn boundary.

### Features Guide

- **Diff Types**: Switch between viewing all changes, staged changes, or unstaged changes (git only; jj shows working copy diff)
- **View Modes**: Toggle between side-by-side and unified diff views
- **File Navigation**: Use the collapsible file tree or flat file list view in the resizable sidebar
- **Code Review**: Click the `+` button on any line to add a comment, or drag across lines for range comments
- **Reviewed Files**: Mark files as reviewed with the checkbox or press `r` - marks automatically clear if the file changes
- **Revision Browser**: Browse commit/revision history in the sidebar and view diffs for any past commit
- **Expand Context**: Expand additional context lines around hunks or expand the full file within the diff
- **Full File View**: Click "View full file" to see the complete file with diff highlights
- **Directory Switcher**: Switch between repositories without restarting the server
- **Dark Mode**: Toggle between light and dark themes (automatically detects system preference)
- **Line Wrapping**: Toggle line wrapping for long lines
- **Real-time Updates**: Changes to files are automatically reflected without page refresh
- **Keyboard Shortcuts**: Press `?` to see all shortcuts (j/k navigation, r to review, Esc to close dialogs)
- **Syntax Highlighting**: Customizable PrismJS themes for better code readability


## Development

### Prerequisites

- Go 1.25 or later
- Node.js 18+ and npm
- Task (optional, for running tasks)

### Running in Development

```bash
# Terminal 1: Run backend
task run
# or
go run main.go

# Terminal 2: Run frontend with hot reload (optional)
cd web && npm run dev
```

### Building Production Binary

```bash
# Build single binary with embedded web assets
task build

# Or manually:
cd web && npm run build && cd ..
go build -o vibediff .
```

The production binary includes all web assets embedded using Go's `embed` package, creating a single self-contained executable.

### Available Tasks

```bash
task            # Show all available tasks
task run        # Run the server
task build      # Build production binary with embedded assets
task build-web  # Build React app only
task install    # Install globally
task test       # Run tests
task lint       # Run Go linter
task fmt        # Format Go code
task clean      # Clean build artifacts
```

### Tech Stack

- **Backend**: Go 1.22+ with Gorilla Mux
- **Frontend**: React 19 with TypeScript
- **Styling**: Tailwind CSS v4
- **Syntax Highlighting**: PrismJS
- **Build Tools**: Vite, Task
- **Code Quality**: ESLint, golangci-lint, pre-commit

## Command Line Options

```bash
vibediff [options] [diff-target]

Options:
  -host string     Host to bind the server to (default "localhost")
  -port int        Port to bind the server to (default 8888)
  -no-open         Disable automatic browser opening
  -debug           Enable debug logging
  -version         Show version information

Environment Variables:
  VIBEDIFF_NO_OPEN   Set to any value to disable automatic browser opening

Examples:
  vibediff                  # Review working copy changes
  vibediff main             # Compare against main branch
  vibediff HEAD~3           # Compare against 3 commits ago
  vibediff -no-open         # Start without opening browser
```

## License

MIT
