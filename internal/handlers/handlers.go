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
	format      string
}

func NewHandler(gitService *git.Service, reviewStore *review.Store) *Handler {
	return &Handler{
		gitService:  gitService,
		reviewStore: reviewStore,
	}
}

func (h *Handler) SetFormat(format string) {
	h.format = format
}

// writeJSON is a helper method to reduce repetitive JSON response code
func (h *Handler) writeJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (h *Handler) GetDiff(w http.ResponseWriter, r *http.Request) {
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

	// Print immediately in text format
	if h.format == "text" {
		fmt.Printf("\n%s:%d\n", comment.File, comment.Line)
		fmt.Printf("%s\n", comment.Content)
	}

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
