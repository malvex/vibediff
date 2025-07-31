# VibeDiff

A local Git diff viewer that runs entirely on your machine. Review your code changes comfortably before committing or pushing to GitHub.

## Why VibeDiff?

- **🏠 Runs Locally**: Single Go binary starts a web server on your machine - no cloud services, no data leaves your computer
- **🔄 Live File Watching**: Automatically updates the diff view as files change - see your edits in real-time
- **💬 AI-Friendly Reviews**: Add review comments to your code, then export them as text/JSON to paste into AI assistants for implementing changes
- **🚀 Pre-Commit Workflow**: Review and annotate your changes before committing, ensuring higher quality commits
- **⚡ Zero Setup**: Just run the binary in any Git repository - no configuration needed

## Features

- 🎨 GitHub-like diff visualization with syntax highlighting (PrismJS)
- 📁 View all changes, staged changes, or unstaged changes
- 🔀 Side-by-side and unified diff view modes
- 📋 Export review comments as text or JSON
- 💬 Inline code review comments with persistent storage
- 🔄 Real-time updates via WebSocket when files change
- ⚡ Single binary distribution with embedded web assets
- 🌓 Dark mode support with automatic theme detection
- 🔍 View full files with diff context highlighting
- 📱 Responsive design with collapsible file tree

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

1. **Start VibeDiff** in your Git repository:
   ```bash
   # Text format (default) - comments are printed to console immediately as you add them
   vibediff

   # JSON format - all comments are output when you stop the server
   vibediff -format json
   ```

2. **Review your changes** in the browser - the diff updates automatically as you edit files

3. **Add review comments** by clicking the `+` button on any line:
   - "TODO: Extract this into a separate function"
   - "FIXME: Add error handling here"
   - "Consider using a more descriptive variable name"

4. **See your comments**:
   - **Text format**: Comments appear in the terminal immediately as you add them
   - **JSON format**: All comments are output when you stop the server (Ctrl+C)

### AI-Powered Workflow

1. **Capture review comments to a file**:
   ```bash
   # Redirect output to a file as comments are added
   vibediff > review.txt
   ```

2. **Use with your AI assistant**:
   ```
   Please read the code review comments in review.txt and implement all the suggested changes.
   The comments indicate specific lines in files where changes are needed.

   Each comment follows this format:
   - File path and line number
   - The actual line of code
   - My review comment with what needs to be changed

   Please make all the changes mentioned in the review.
   ```

3. **Benefits**:
   - **Precise Instructions**: Comments are tied to specific lines, eliminating ambiguity
   - **Batch Changes**: Review all changes first, then have AI implement them in one go
   - **Quality Control**: Review AI-suggested changes before committing
   - **Iterative Workflow**: Run vibediff again after AI changes to verify and add more comments if needed

### Features Guide

- **Diff Types**: Switch between viewing all changes, staged changes, or unstaged changes
- **View Modes**: Toggle between side-by-side and unified diff views
- **File Navigation**: Use the collapsible file tree or file list view
- **Code Review**: Click the `+` button on any line to add a comment
- **Full File View**: Click "View full file" to see the complete file with diff highlights
- **Dark Mode**: Toggle between light and dark themes (automatically detects system preference)
- **Real-time Updates**: Changes to files are automatically reflected without page refresh
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
vibediff [options]

Options:
  -host string     Host to bind the server to (default "localhost")
  -port int        Port to bind the server to (default 8888)
  -format string   Output format for review comments: text or json (default "text")
  -debug           Enable debug logging
  -version         Show version information
```

## License

MIT
