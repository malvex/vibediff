package watcher

import (
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/malvex/vibediff/internal/git"
)

// GitWatcher monitors VCS status for changes
type GitWatcher struct {
	hub          ChangeNotifier
	lastStatus   string
	pollInterval time.Duration
	done         chan bool
	workingDir   string
	backend      git.VCSBackend
	mu           sync.Mutex
}

// ChangeNotifier interface for notifying changes
type ChangeNotifier interface {
	NotifyChange(changeType string)
}

// NewGitWatcher creates a new VCS watcher
func NewGitWatcher(hub ChangeNotifier, backend git.VCSBackend) *GitWatcher {
	return &GitWatcher{
		hub:          hub,
		pollInterval: 1 * time.Second,
		done:         make(chan bool),
		backend:      backend,
	}
}

// Start begins monitoring for changes
func (w *GitWatcher) Start() {
	go func() {
		ticker := time.NewTicker(w.pollInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				w.checkForChanges()
			case <-w.done:
				if os.Getenv("VIBEDIFF_DEBUG") == "true" {
					log.Println("VCS watcher stopped")
				}
				return
			}
		}
	}()
}

// Stop stops the watcher
func (w *GitWatcher) Stop() {
	select {
	case <-w.done:
		// Already closed
	default:
		close(w.done)
	}
}

func (w *GitWatcher) checkForChanges() {
	w.mu.Lock()
	dir := w.workingDir
	backend := w.backend
	w.mu.Unlock()

	// Create a temporary service to get raw status
	svc := git.NewService()
	if dir != "" {
		// We just need to set the working dir field without validation
		// Use a simple approach: set backend and get status
		svc.SetWorkingDirUnsafe(dir)
	}
	svc.SetBackend(backend)

	output, err := svc.StatusRaw()
	if err != nil {
		if os.Getenv("VIBEDIFF_DEBUG") == "true" {
			log.Printf("Error checking VCS status: %v", err)
		}
		return
	}

	currentStatus := output

	w.mu.Lock()
	defer w.mu.Unlock()

	// If the directory changed while we were running, discard stale result
	if w.workingDir != dir {
		return
	}

	// Check if status changed
	if currentStatus != w.lastStatus {
		w.lastStatus = currentStatus

		// Determine change type
		changeType := "file_changed"
		if backend == git.BackendJJ {
			if strings.Contains(currentStatus, "A ") {
				changeType = "file_added"
			} else if strings.Contains(currentStatus, "D ") {
				changeType = "file_deleted"
			}
		} else {
			if strings.Contains(currentStatus, "??") {
				changeType = "file_added"
			} else if strings.Contains(currentStatus, " D ") {
				changeType = "file_deleted"
			}
		}

		w.hub.NotifyChange(changeType)
	}
}

// SetWorkingDir changes the working directory for VCS commands
func (w *GitWatcher) SetWorkingDir(dir string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.workingDir = dir
	w.lastStatus = "" // Reset to trigger update
}

// SetBackend changes the VCS backend
func (w *GitWatcher) SetBackend(backend git.VCSBackend) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.backend = backend
	w.lastStatus = "" // Reset to trigger update
}
