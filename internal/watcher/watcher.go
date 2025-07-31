package watcher

import (
	"log"
	"os"
	"os/exec"
	"strings"
	"time"
)

// GitWatcher monitors git status for changes
type GitWatcher struct {
	hub          ChangeNotifier
	lastStatus   string
	pollInterval time.Duration
	done         chan bool
}

// ChangeNotifier interface for notifying changes
type ChangeNotifier interface {
	NotifyChange(changeType string)
}

// NewGitWatcher creates a new git watcher
func NewGitWatcher(hub ChangeNotifier) *GitWatcher {
	return &GitWatcher{
		hub:          hub,
		pollInterval: 1 * time.Second,
		done:         make(chan bool),
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
					log.Println("Git watcher stopped")
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
	// Get current git status
	cmd := exec.Command("git", "status", "--porcelain")
	output, err := cmd.Output()
	if err != nil {
		if os.Getenv("VIBEDIFF_DEBUG") == "true" {
			log.Printf("Error checking git status: %v", err)
		}
		return
	}

	currentStatus := string(output)

	// Check if status changed
	if currentStatus != w.lastStatus {
		w.lastStatus = currentStatus

		// Determine change type
		changeType := "file_changed"
		if strings.Contains(currentStatus, "??") {
			changeType = "file_added"
		} else if strings.Contains(currentStatus, " D ") {
			changeType = "file_deleted"
		}

		// Notify about the change
		w.hub.NotifyChange(changeType)
	}
}
