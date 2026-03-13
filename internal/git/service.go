package git

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

type Service struct {
	diffTarget string
	workingDir string // empty string means use process cwd
	backend    VCSBackend
}

func NewService() *Service {
	return &Service{}
}

// SetDiffTarget sets the target for diff (e.g., "main", "HEAD~1", commit hash)
func (s *Service) SetDiffTarget(target string) {
	s.diffTarget = target
}

// GetBackend returns the detected VCS backend
func (s *Service) GetBackend() VCSBackend {
	return s.backend
}

// DetectBackend detects whether we're in a jj or git repo
func (s *Service) DetectBackend() VCSBackend {
	// Check for jj first
	if s.isJJRepo() {
		return BackendJJ
	}
	return BackendGit
}

func (s *Service) isJJRepo() bool {
	var cmd *exec.Cmd
	if s.workingDir != "" {
		cmd = exec.Command("jj", "root", "-R", s.workingDir)
	} else {
		cmd = exec.Command("jj", "root")
	}
	cmd.Stderr = nil
	return cmd.Run() == nil
}

// GetDiff retrieves the diff with optional context lines (default: 3)
func (s *Service) GetDiff(diffType DiffType, contextLines ...int) (*DiffResult, error) {
	context := 3
	if len(contextLines) > 0 {
		context = contextLines[0]
	}

	if s.backend == BackendJJ {
		return s.getJJDiff(diffType, context)
	}
	return s.getGitDiff(diffType, context)
}

func (s *Service) getGitDiff(diffType DiffType, context int) (*DiffResult, error) {
	var args []string

	if s.diffTarget != "" {
		args = []string{"diff", s.diffTarget, "--no-color", "--no-ext-diff"}
	} else {
		switch diffType {
		case DiffTypeStaged:
			args = []string{"diff", "--cached", "--no-color", "--no-ext-diff"}
		case DiffTypeUnstaged:
			args = []string{"diff", "--no-color", "--no-ext-diff"}
		default:
			args = []string{"diff", "HEAD", "--no-color", "--no-ext-diff"}
		}
	}

	if context >= 0 {
		args = append(args, fmt.Sprintf("-U%d", context))
	}

	output, err := s.runGitCommand(args...)
	if err != nil {
		return nil, fmt.Errorf("failed to get diff: %w", err)
	}

	files, err := s.parseDiff(output)
	if err != nil {
		return nil, fmt.Errorf("failed to parse diff: %w", err)
	}

	// Get untracked files and add them to the diff
	if diffType == DiffTypeUnstaged || diffType == DiffTypeAll {
		untrackedFiles, err := s.getUntrackedFiles()
		if err == nil && len(untrackedFiles) > 0 {
			for _, filepath := range untrackedFiles {
				fileDiff, err := s.getUntrackedFileDiff(filepath, context)
				if err == nil && fileDiff != nil {
					files = append(files, *fileDiff)
				}
			}
		}
	}

	return &DiffResult{
		Files: files,
		Type:  diffType,
	}, nil
}

func (s *Service) getJJDiff(diffType DiffType, context int) (*DiffResult, error) {
	args := []string{"diff", "--git"}

	if s.diffTarget != "" {
		args = append(args, "--from", s.diffTarget)
	}

	if context >= 0 {
		args = append(args, fmt.Sprintf("--context=%d", context))
	}

	output, err := s.runJJCommand(args...)
	if err != nil {
		return nil, fmt.Errorf("failed to get jj diff: %w", err)
	}

	files, err := s.parseDiff(output)
	if err != nil {
		return nil, fmt.Errorf("failed to parse diff: %w", err)
	}

	// jj diff already includes new files, no separate untracked handling needed
	return &DiffResult{
		Files: files,
		Type:  diffType,
	}, nil
}

func (s *Service) GetStatus() ([]string, error) {
	if s.backend == BackendJJ {
		return s.getJJStatus()
	}
	return s.getGitStatus()
}

func (s *Service) getGitStatus() ([]string, error) {
	output, err := s.runGitCommand("status", "--porcelain")
	if err != nil {
		return nil, err
	}

	lines := strings.Split(strings.TrimSpace(output), "\n")
	var files []string
	for _, line := range lines {
		if len(line) > 3 {
			files = append(files, strings.TrimSpace(line[3:]))
		}
	}

	return files, nil
}

func (s *Service) getJJStatus() ([]string, error) {
	output, err := s.runJJCommand("status")
	if err != nil {
		return nil, err
	}

	lines := strings.Split(strings.TrimSpace(output), "\n")
	var files []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		// jj status lines look like: "M file.txt", "A file.txt", "D file.txt"
		// Skip header lines like "Working copy changes:" and "Working copy :"
		if len(line) > 2 && (line[0] == 'M' || line[0] == 'A' || line[0] == 'D' || line[0] == 'R' || line[0] == 'C') && line[1] == ' ' {
			files = append(files, line[2:])
		}
	}

	return files, nil
}

func (s *Service) runGitCommand(args ...string) (string, error) {
	var cmdArgs []string
	if s.workingDir != "" {
		cmdArgs = append([]string{"-C", s.workingDir}, args...)
	} else {
		cmdArgs = args
	}

	cmd := exec.Command("git", cmdArgs...)
	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return "", fmt.Errorf("git command failed: %s", stderr.String())
	}

	return out.String(), nil
}

func (s *Service) runJJCommand(args ...string) (string, error) {
	var cmdArgs []string
	if s.workingDir != "" {
		cmdArgs = append([]string{"-R", s.workingDir}, args...)
	} else {
		cmdArgs = args
	}

	// Use --no-pager and --color=never for consistent output
	cmdArgs = append([]string{"--no-pager", "--color=never"}, cmdArgs...)

	cmd := exec.Command("jj", cmdArgs...)
	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return "", fmt.Errorf("jj command failed: %s", stderr.String())
	}

	return out.String(), nil
}

func (s *Service) parseDiff(diffOutput string) ([]FileDiff, error) {
	if diffOutput == "" {
		return []FileDiff{}, nil
	}

	parser := newDiffParser(diffOutput)
	return parser.parse()
}

func (s *Service) GetFileContent(filePath string) (string, error) {
	if s.backend == BackendJJ {
		return s.getJJFileContent(filePath)
	}
	return s.getGitFileContent(filePath)
}

func (s *Service) getGitFileContent(filePath string) (string, error) {
	content, err := s.runGitCommand("show", fmt.Sprintf("HEAD:%s", filePath))
	if err != nil {
		// If not in HEAD, try to read from filesystem
		fullPath := filePath
		if s.workingDir != "" {
			fullPath = s.workingDir + "/" + filePath
		}
		content, err := os.ReadFile(fullPath)
		if err != nil {
			return "", fmt.Errorf("failed to read file: %w", err)
		}
		return string(content), nil
	}
	return content, nil
}

func (s *Service) getJJFileContent(filePath string) (string, error) {
	// Show file at parent of working copy
	content, err := s.runJJCommand("file", "show", "-r", "@-", filePath)
	if err != nil {
		// If not in parent, try reading from filesystem
		fullPath := filePath
		if s.workingDir != "" {
			fullPath = s.workingDir + "/" + filePath
		}
		content, err := os.ReadFile(fullPath)
		if err != nil {
			return "", fmt.Errorf("failed to read file: %w", err)
		}
		return string(content), nil
	}
	return content, nil
}

// GetFileDiff retrieves diff for a specific file with optional context lines
func (s *Service) GetFileDiff(filename string, diffType DiffType, contextLines ...int) (*FileDiff, error) {
	context := 3
	if len(contextLines) > 0 {
		context = contextLines[0]
	}

	if s.backend == BackendGit {
		// Check if it's an untracked file (git only)
		untrackedFiles, err := s.getUntrackedFiles()
		if err == nil {
			for _, untracked := range untrackedFiles {
				if untracked == filename {
					return s.getUntrackedFileDiff(filename, context)
				}
			}
		}
	}

	// Get from regular diff
	diff, err := s.GetDiff(diffType, contextLines...)
	if err != nil {
		return nil, err
	}

	for _, file := range diff.Files {
		if file.Path == filename {
			return &file, nil
		}
	}

	return nil, fmt.Errorf("file not found in diff: %s", filename)
}

// GetFileDiffWithFullContext is a convenience method for getting full file context
func (s *Service) GetFileDiffWithFullContext(filename string, diffType DiffType) (*FileDiff, error) {
	return s.GetFileDiff(filename, diffType, 999999)
}

// GetRevisionFileDiffWithFullContext returns a file diff with full context for a specific revision
func (s *Service) GetRevisionFileDiffWithFullContext(filename string, revisionID string) (*FileDiff, error) {
	diff, err := s.GetRevisionDiff(revisionID, 999999)
	if err != nil {
		return nil, err
	}
	for _, file := range diff.Files {
		if file.Path == filename {
			return &file, nil
		}
	}
	return nil, fmt.Errorf("file not found in revision diff: %s", filename)
}

// getUntrackedFiles returns list of untracked files from git status
func (s *Service) getUntrackedFiles() ([]string, error) {
	output, err := s.runGitCommand("ls-files", "--others", "--exclude-standard")
	if err != nil {
		return nil, err
	}

	if output == "" {
		return []string{}, nil
	}

	lines := strings.Split(strings.TrimSpace(output), "\n")
	var files []string
	for _, line := range lines {
		if line != "" {
			files = append(files, line)
		}
	}

	return files, nil
}

// getUntrackedFileDiff creates a diff for an untracked file
func (s *Service) getUntrackedFileDiff(filepath string, contextLines int) (*FileDiff, error) {
	fullPath := filepath
	if s.workingDir != "" {
		fullPath = s.workingDir + "/" + filepath
	}
	content, err := os.ReadFile(fullPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read untracked file %s: %w", filepath, err)
	}

	lines := strings.Split(string(content), "\n")

	var diffLines []Line
	for i, line := range lines {
		lineNum := i + 1
		diffLines = append(diffLines, Line{
			Type:      LineTypeAdded,
			NewNumber: &lineNum,
			Content:   line,
		})
	}

	return &FileDiff{
		Path:      filepath,
		Status:    FileStatusAdded,
		Additions: len(lines),
		Deletions: 0,
		IsBinary:  false,
		Hunks: []Hunk{
			{
				OldStart: 0,
				OldLines: 0,
				NewStart: 1,
				NewLines: len(lines),
				Header:   fmt.Sprintf("@@ -0,0 +1,%d @@", len(lines)),
				Lines:    diffLines,
			},
		},
	}, nil
}

// GetRevisions returns recent revisions/commits
func (s *Service) GetRevisions(limit int) ([]Revision, error) {
	if limit <= 0 {
		limit = 50
	}
	if s.backend == BackendJJ {
		return s.getJJRevisions(limit)
	}
	return s.getGitRevisions(limit)
}

func (s *Service) getGitRevisions(limit int) ([]Revision, error) {
	output, err := s.runGitCommand("log", fmt.Sprintf("--format=format:%%H\x00%%h\x00%%s\x00%%an\x00%%aI"), fmt.Sprintf("-n%d", limit))
	if err != nil {
		return nil, fmt.Errorf("failed to get git log: %w", err)
	}

	if output == "" {
		return []Revision{}, nil
	}

	lines := strings.Split(strings.TrimSpace(output), "\n")
	var revisions []Revision
	for _, line := range lines {
		parts := strings.SplitN(line, "\x00", 5)
		if len(parts) < 5 {
			continue
		}
		revisions = append(revisions, Revision{
			ID:          parts[0],
			ShortID:     parts[1],
			Description: parts[2],
			Author:      parts[3],
			Timestamp:   parts[4],
		})
	}

	return revisions, nil
}

func (s *Service) getJJRevisions(limit int) ([]Revision, error) {
	template := `change_id ++ "\x00" ++ change_id.shortest(8) ++ "\x00" ++ description.first_line() ++ "\x00" ++ author.name() ++ "\x00" ++ author.timestamp() ++ "\n"`
	output, err := s.runJJCommand("log", "--no-graph", "-r", fmt.Sprintf("ancestors(@, %d)", limit), "-T", template)
	if err != nil {
		return nil, fmt.Errorf("failed to get jj log: %w", err)
	}

	if output == "" {
		return []Revision{}, nil
	}

	lines := strings.Split(strings.TrimSpace(output), "\n")
	var revisions []Revision
	for _, line := range lines {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\x00", 5)
		if len(parts) < 5 {
			continue
		}
		revisions = append(revisions, Revision{
			ID:          parts[0],
			ShortID:     parts[1],
			Description: parts[2],
			Author:      parts[3],
			Timestamp:   parts[4],
		})
	}

	return revisions, nil
}

// GetRevisionDiff returns the diff for a specific revision
func (s *Service) GetRevisionDiff(revisionID string, contextLines ...int) (*DiffResult, error) {
	context := 3
	if len(contextLines) > 0 {
		context = contextLines[0]
	}

	if s.backend == BackendJJ {
		return s.getJJRevisionDiff(revisionID, context)
	}
	return s.getGitRevisionDiff(revisionID, context)
}

func (s *Service) getGitRevisionDiff(revisionID string, context int) (*DiffResult, error) {
	args := []string{"diff", revisionID + "~1", revisionID, "--no-color", "--no-ext-diff"}
	if context >= 0 {
		args = append(args, fmt.Sprintf("-U%d", context))
	}

	output, err := s.runGitCommand(args...)
	if err != nil {
		// Fallback for initial commit (no parent)
		args = []string{"diff", "--no-color", "--no-ext-diff", fmt.Sprintf("-U%d", context), "4b825dc642cb6eb9a060e54bf899d69f82cf7256", revisionID}
		output, err = s.runGitCommand(args...)
		if err != nil {
			return nil, fmt.Errorf("failed to get revision diff: %w", err)
		}
	}

	files, err := s.parseDiff(output)
	if err != nil {
		return nil, fmt.Errorf("failed to parse diff: %w", err)
	}

	return &DiffResult{
		Files: files,
		Type:  DiffTypeAll,
	}, nil
}

func (s *Service) getJJRevisionDiff(revisionID string, context int) (*DiffResult, error) {
	args := []string{"diff", "--git", "-r", revisionID}
	if context >= 0 {
		args = append(args, fmt.Sprintf("--context=%d", context))
	}

	output, err := s.runJJCommand(args...)
	if err != nil {
		return nil, fmt.Errorf("failed to get jj revision diff: %w", err)
	}

	files, err := s.parseDiff(output)
	if err != nil {
		return nil, fmt.Errorf("failed to parse diff: %w", err)
	}

	return &DiffResult{
		Files: files,
		Type:  DiffTypeAll,
	}, nil
}

// SetWorkingDir changes the working directory for VCS commands
func (s *Service) SetWorkingDir(dir string) error {
	if err := s.ValidateRepo(dir); err != nil {
		return err
	}
	s.workingDir = dir
	s.backend = s.DetectBackend()
	return nil
}

// GetWorkingDir returns the current working directory
func (s *Service) GetWorkingDir() string {
	if s.workingDir != "" {
		return s.workingDir
	}
	if cwd, err := os.Getwd(); err == nil {
		return cwd
	}
	return ""
}

// ValidateRepo checks if the directory is a valid git or jj repository
func (s *Service) ValidateRepo(dir string) error {
	// Check jj first
	cmd := exec.Command("jj", "root", "-R", dir)
	cmd.Stderr = nil
	if cmd.Run() == nil {
		return nil
	}

	// Fall back to git
	cmd = exec.Command("git", "-C", dir, "rev-parse", "--git-dir")
	cmd.Stderr = nil
	if cmd.Run() == nil {
		return nil
	}

	return fmt.Errorf("not a git or jj repository: %s", dir)
}

// ValidateGitRepo checks if the directory is a valid repository (git or jj)
// Kept for backward compatibility
func (s *Service) ValidateGitRepo(dir string) error {
	return s.ValidateRepo(dir)
}

// SetBackend explicitly sets the VCS backend
func (s *Service) SetBackend(backend VCSBackend) {
	s.backend = backend
}

// SetWorkingDirUnsafe sets the working directory without validation (used by watcher)
func (s *Service) SetWorkingDirUnsafe(dir string) {
	s.workingDir = dir
}

// StatusRaw returns raw status output for change detection (used by watcher)
func (s *Service) StatusRaw() (string, error) {
	if s.backend == BackendJJ {
		return s.runJJCommand("status")
	}
	return s.runGitCommand("status", "--porcelain")
}
