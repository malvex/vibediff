package review

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

type Comment struct {
	ID        string    `json:"id"`
	File      string    `json:"file"`
	Line      int       `json:"line,omitempty"`
	Side      string    `json:"side,omitempty"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
}

type Store struct {
	mu       sync.RWMutex
	comments map[string]*Comment
}

func NewStore() *Store {
	return &Store{
		comments: make(map[string]*Comment),
	}
}

func (s *Store) AddComment(comment *Comment) {
	s.mu.Lock()
	defer s.mu.Unlock()

	comment.ID = generateID()
	comment.CreatedAt = time.Now()
	s.comments[comment.ID] = comment
}

func (s *Store) GetComments(file string) []*Comment {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var comments []*Comment
	for _, c := range s.comments {
		if c.File == file {
			comments = append(comments, c)
		}
	}
	return comments
}

func (s *Store) GetAllComments() []*Comment {
	s.mu.RLock()
	defer s.mu.RUnlock()

	comments := make([]*Comment, 0, len(s.comments))
	for _, c := range s.comments {
		comments = append(comments, c)
	}
	return comments
}

func (s *Store) DeleteComment(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.comments[id]; exists {
		delete(s.comments, id)
		return true
	}
	return false
}

func generateID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		// Fallback to timestamp if crypto/rand fails
		return time.Now().Format("20060102150405.999999999")
	}
	return hex.EncodeToString(b)
}
