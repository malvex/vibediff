package git

type DiffType string

const (
	DiffTypeUnstaged DiffType = "unstaged"
	DiffTypeStaged   DiffType = "staged"
	DiffTypeAll      DiffType = "all"
)

// VCSBackend represents the version control system being used
type VCSBackend string

const (
	BackendGit VCSBackend = "git"
	BackendJJ  VCSBackend = "jj"
)

type FileDiff struct {
	Path      string     `json:"path"`
	OldPath   string     `json:"oldPath,omitempty"`
	Status    FileStatus `json:"status"`
	Additions int        `json:"additions"`
	Deletions int        `json:"deletions"`
	IsBinary  bool       `json:"isBinary"`
	Hunks     []Hunk     `json:"hunks"`
}

type FileStatus string

const (
	FileStatusAdded    FileStatus = "added"
	FileStatusModified FileStatus = "modified"
	FileStatusDeleted  FileStatus = "deleted"
	FileStatusRenamed  FileStatus = "renamed"
)

type Hunk struct {
	OldStart int    `json:"oldStart"`
	OldLines int    `json:"oldLines"`
	NewStart int    `json:"newStart"`
	NewLines int    `json:"newLines"`
	Header   string `json:"header"`
	Lines    []Line `json:"lines"`
}

type Line struct {
	Type      LineType `json:"type"`
	OldNumber *int     `json:"oldNumber,omitempty"`
	NewNumber *int     `json:"newNumber,omitempty"`
	Content   string   `json:"content"`
}

type LineType string

const (
	LineTypeContext LineType = "context"
	LineTypeAdded   LineType = "added"
	LineTypeDeleted LineType = "deleted"
)

type DiffResult struct {
	Files []FileDiff `json:"files"`
	Type  DiffType   `json:"type"`
}

// Revision represents a single commit/revision in the VCS history
type Revision struct {
	ID          string `json:"id"`
	ShortID     string `json:"shortId"`
	Description string `json:"description"`
	Author      string `json:"author"`
	Timestamp   string `json:"timestamp"`
}
