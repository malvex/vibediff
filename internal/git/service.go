package git

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"
)

type Service struct{}

func NewService() *Service {
	return &Service{}
}

// GetDiff retrieves the git diff with optional context lines (default: 3)
func (s *Service) GetDiff(diffType DiffType, contextLines ...int) (*DiffResult, error) {
	context := 3
	if len(contextLines) > 0 {
		context = contextLines[0]
	}

	var args []string

	switch diffType {
	case DiffTypeStaged:
		args = []string{"diff", "--cached", "--no-color", "--no-ext-diff"}
	case DiffTypeUnstaged:
		args = []string{"diff", "--no-color", "--no-ext-diff"}
	default:
		args = []string{"diff", "HEAD", "--no-color", "--no-ext-diff"}
	}

	// Add context parameter
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

	return &DiffResult{
		Files: files,
		Type:  diffType,
	}, nil
}

func (s *Service) GetStatus() ([]string, error) {
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

func (s *Service) runGitCommand(args ...string) (string, error) {
	cmd := exec.Command("git", args...)
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

func (s *Service) parseDiff(diffOutput string) ([]FileDiff, error) {
	if diffOutput == "" {
		return []FileDiff{}, nil
	}

	parser := newDiffParser(diffOutput)
	return parser.parse()
}

func (s *Service) GetFileContent(filePath string) (string, error) {
	// First check if file exists in working directory
	content, err := s.runGitCommand("show", fmt.Sprintf("HEAD:%s", filePath))
	if err != nil {
		// If not in HEAD, try to read from filesystem
		output, err := exec.Command("cat", filePath).Output()
		if err != nil {
			return "", fmt.Errorf("failed to read file: %w", err)
		}
		return string(output), nil
	}
	return content, nil
}

// GetFileDiff retrieves diff for a specific file with optional context lines
func (s *Service) GetFileDiff(filename string, diffType DiffType, contextLines ...int) (*FileDiff, error) {
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
