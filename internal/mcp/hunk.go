package mcp

import (
	"context"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/malvex/vibediff/internal/git"
	"github.com/malvex/vibediff/internal/review"
)

// hunkContextLines controls how many unchanged lines surround the changed
// lines in the inlined diff hunk. Matches the design doc value (±25).
const hunkContextLines = 25

// NewGitHunkProvider returns a HunkProvider that uses the supplied git
// service to produce per-comment diff hunks pinned to Comment.Commit and
// a drift signal comparing pinned content to current working copy.
func NewGitHunkProvider(svc *git.Service) HunkProvider {
	return &gitHunkProvider{svc: svc}
}

type gitHunkProvider struct {
	svc *git.Service
}

func (p *gitHunkProvider) HunkFor(_ context.Context, c *review.Comment) (Hunk, error) {
	if c == nil || c.File == "" {
		return Hunk{}, nil
	}

	raw, err := p.svc.FileDiffText(c.File, c.Revision, hunkContextLines)
	if err != nil {
		// Best-effort: a missing diff (e.g. revision no longer reachable)
		// degrades to empty text rather than failing the whole tool call.
		raw = ""
	}

	return Hunk{
		Text:      extractRelevantHunks(raw, c.Line, c.LineEnd, c.Side),
		Truncated: false,
		Drifted:   p.driftedAt(c),
	}, nil
}

// hunkHeaderRE matches a unified-diff hunk header:
//
//	@@ -oldStart[,oldCount] +newStart[,newCount] @@ optional trailing text
//
// When the count is omitted, unified-diff convention treats it as 1.
var hunkHeaderRE = regexp.MustCompile(`^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@`)

// extractRelevantHunks reduces a file-level unified diff to just the hunks
// whose old- or new-side range overlaps the comment's line range, keeping
// the file header (diff --git, ---, +++ lines) so the agent can orient.
// Returns the empty string when no hunk overlaps.
func extractRelevantHunks(diffText string, line, lineEnd int, side string) string {
	if diffText == "" {
		return ""
	}
	if lineEnd < line {
		lineEnd = line
	}

	var header []string
	var hunks [][]string
	var current []string
	inHunk := false

	for _, l := range strings.Split(diffText, "\n") {
		if strings.HasPrefix(l, "@@") {
			if inHunk && len(current) > 0 {
				hunks = append(hunks, current)
			}
			current = []string{l}
			inHunk = true
			continue
		}
		if inHunk {
			current = append(current, l)
		} else {
			header = append(header, l)
		}
	}
	if inHunk && len(current) > 0 {
		hunks = append(hunks, current)
	}

	var keep []string
	for _, h := range hunks {
		if hunkOverlaps(h[0], line, lineEnd, side) {
			keep = append(keep, h...)
		}
	}
	if len(keep) == 0 {
		return ""
	}

	out := make([]string, 0, len(header)+len(keep))
	out = append(out, header...)
	out = append(out, keep...)
	return strings.Join(out, "\n")
}

// hunkOverlaps reports whether the line range in a hunk header overlaps
// the comment's range. Side restricts the comparison to one side of the
// diff; an empty side matches if either side overlaps.
func hunkOverlaps(headerLine string, line, lineEnd int, side string) bool {
	m := hunkHeaderRE.FindStringSubmatch(headerLine)
	if m == nil {
		return false
	}
	oldStart := atoiOr(m[1], 0)
	oldCount := atoiOr(m[2], 1)
	newStart := atoiOr(m[3], 0)
	newCount := atoiOr(m[4], 1)

	oldEnd := oldStart + oldCount - 1
	newEnd := newStart + newCount - 1

	switch side {
	case "left":
		return rangesOverlap(oldStart, oldEnd, line, lineEnd)
	case "right":
		return rangesOverlap(newStart, newEnd, line, lineEnd)
	default:
		return rangesOverlap(oldStart, oldEnd, line, lineEnd) ||
			rangesOverlap(newStart, newEnd, line, lineEnd)
	}
}

func rangesOverlap(a1, a2, b1, b2 int) bool {
	return a1 <= b2 && b1 <= a2
}

func atoiOr(s string, fallback int) int {
	if s == "" {
		return fallback
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return fallback
	}
	return n
}

// driftedAt compares the file content at the comment's pinned commit with
// the current working-copy content at the same line range. Returns false
// on any inability to read either side, so a transient VCS error never
// produces a false-positive drift flag.
func (p *gitHunkProvider) driftedAt(c *review.Comment) bool {
	if c.Commit == "" || c.File == "" {
		return false
	}

	pinned, err := p.svc.FileContentAtCommit(c.Commit, c.File)
	if err != nil {
		return false
	}

	current, err := p.readWorkingCopy(c.File)
	if err != nil {
		return false
	}

	return linesDiffer(pinned, current, c.Line, c.LineEnd)
}

func (p *gitHunkProvider) readWorkingCopy(file string) (string, error) {
	full := file
	if dir := p.svc.GetWorkingDir(); dir != "" {
		full = filepath.Join(dir, file)
	}
	b, err := os.ReadFile(full)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// linesDiffer reports whether the 1-indexed inclusive range [start, end]
// in a and b contain different content. Out-of-bounds ranges count as
// "differ" since the line no longer exists in one side.
func linesDiffer(a, b string, start, end int) bool {
	if start <= 0 {
		start = 1
	}
	if end < start {
		end = start
	}

	aLines := strings.Split(a, "\n")
	bLines := strings.Split(b, "\n")
	for i := start - 1; i < end; i++ {
		if i < 0 {
			continue
		}
		aLine, aOK := safeIndex(aLines, i)
		bLine, bOK := safeIndex(bLines, i)
		if aOK != bOK {
			return true
		}
		if aLine != bLine {
			return true
		}
	}
	return false
}

func safeIndex(lines []string, i int) (string, bool) {
	if i < 0 || i >= len(lines) {
		return "", false
	}
	return lines[i], true
}
