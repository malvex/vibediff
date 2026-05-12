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

## Installation

### Homebrew (macOS)

```bash
brew install malvex/tap/vibediff
```

### Download Binary

Download the latest binary for your platform from the [GitHub Releases](https://github.com/malvex/vibediff/releases) page.

### Build From Source

```bash
git clone https://github.com/malvex/vibediff.git
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

### AI-Powered Workflow

1. **Review and annotate** your changes in VibeDiff
2. **Copy comments** as markdown using the copy button
3. **Paste into your AI assistant** with instructions to implement the changes
4. **Re-run VibeDiff** to verify the AI's changes and iterate

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

- Go 1.22 or later
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
