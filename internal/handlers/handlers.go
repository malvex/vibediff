package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"

	"github.com/gorilla/mux"

	"github.com/malvex/vibediff/internal/git"
	"github.com/malvex/vibediff/internal/review"
)

type Handler struct {
	gitService  *git.Service
	reviewStore *review.Store
	watcher     interface {
		SetWorkingDir(string)
		SetBackend(git.VCSBackend)
	}
}

func NewHandler(gitService *git.Service, reviewStore *review.Store, watcher interface {
	SetWorkingDir(string)
	SetBackend(git.VCSBackend)
}) *Handler {
	return &Handler{
		gitService:  gitService,
		reviewStore: reviewStore,
		watcher:     watcher,
	}
}

// writeJSON is a helper method to reduce repetitive JSON response code
func (h *Handler) writeJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (h *Handler) GetDiff(w http.ResponseWriter, r *http.Request) {
	// Check if a specific revision is requested
	revision := r.URL.Query().Get("revision")
	if revision != "" {
		diff, err := h.gitService.GetRevisionDiff(revision)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		result := map[string]interface{}{
			"files":    diff.Files,
			"type":     diff.Type,
			"revision": revision,
		}
		h.writeJSON(w, result)
		return
	}

	diffType := git.DiffType(r.URL.Query().Get("type"))
	if diffType == "" {
		diffType = git.DiffTypeAll
	}

	diff, err := h.gitService.GetDiff(diffType)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	result := map[string]interface{}{
		"files": diff.Files,
		"type":  diffType,
	}

	h.writeJSON(w, result)
}

func (h *Handler) GetRevisions(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := fmt.Sscanf(l, "%d", &limit); err != nil || n != 1 {
			limit = 50
		}
	}

	revisions, err := h.gitService.GetRevisions(limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	h.writeJSON(w, revisions)
}

func (h *Handler) GetFileDiff(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	filename, err := url.QueryUnescape(vars["file"])
	if err != nil {
		http.Error(w, "Invalid file path", http.StatusBadRequest)
		return
	}

	diffType := git.DiffType(r.URL.Query().Get("type"))
	if diffType == "" {
		diffType = git.DiffTypeAll
	}

	diff, err := h.gitService.GetFileDiff(filename, diffType)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	h.writeJSON(w, diff)
}

func (h *Handler) AddComment(w http.ResponseWriter, r *http.Request) {
	var comment review.Comment
	if err := json.NewDecoder(r.Body).Decode(&comment); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	h.reviewStore.AddComment(&comment)
	h.writeJSON(w, comment)
}

func (h *Handler) GetComments(w http.ResponseWriter, r *http.Request) {
	file := r.URL.Query().Get("file")

	var comments []*review.Comment
	if file != "" {
		comments = h.reviewStore.GetComments(file)
	} else {
		comments = h.reviewStore.GetAllComments()
	}

	h.writeJSON(w, comments)
}

func (h *Handler) DeleteComment(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	if h.reviewStore.DeleteComment(id) {
		w.WriteHeader(http.StatusNoContent)
	} else {
		http.Error(w, "Comment not found", http.StatusNotFound)
	}
}

func (h *Handler) GetFullFileWithDiff(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	filename, err := url.QueryUnescape(vars["file"])
	if err != nil {
		http.Error(w, "Invalid file path", http.StatusBadRequest)
		return
	}

	revision := r.URL.Query().Get("revision")
	if revision != "" {
		diff, err := h.gitService.GetRevisionFileDiffWithFullContext(filename, revision)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		h.writeJSON(w, diff)
		return
	}

	diffType := git.DiffType(r.URL.Query().Get("type"))
	if diffType == "" {
		diffType = git.DiffTypeAll
	}

	diff, err := h.gitService.GetFileDiffWithFullContext(filename, diffType)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	h.writeJSON(w, diff)
}

func (h *Handler) GetFileContent(w http.ResponseWriter, r *http.Request) {
	filePath := r.URL.Query().Get("path")
	if filePath == "" {
		http.Error(w, "Missing file path", http.StatusBadRequest)
		return
	}

	content, err := h.gitService.GetFileContent(filePath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to read file: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	if _, err := w.Write([]byte(content)); err != nil {
		log.Printf("Failed to write file content: %v", err)
	}
}

// GetDirectory returns the current working directory and backend info
func (h *Handler) GetDirectory(w http.ResponseWriter, r *http.Request) {
	dir := h.gitService.GetWorkingDir()
	h.writeJSON(w, map[string]string{
		"directory": dir,
		"backend":   string(h.gitService.GetBackend()),
	})
}

// SetDirectory changes the working directory
func (h *Handler) SetDirectory(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Directory string `json:"directory"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.gitService.SetWorkingDir(req.Directory); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	h.watcher.SetWorkingDir(req.Directory)
	h.watcher.SetBackend(h.gitService.GetBackend())
	h.reviewStore.Clear()

	h.writeJSON(w, map[string]string{
		"directory": req.Directory,
		"backend":   string(h.gitService.GetBackend()),
	})
}

// ValidateDirectory validates a directory is a git or jj repo
func (h *Handler) ValidateDirectory(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Directory string `json:"directory"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	err := h.gitService.ValidateGitRepo(req.Directory)
	result := map[string]interface{}{
		"valid": err == nil,
	}
	if err != nil {
		result["error"] = err.Error()
	}
	h.writeJSON(w, result)
}
