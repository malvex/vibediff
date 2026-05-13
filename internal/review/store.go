package review

import (
	"crypto/rand"
	"encoding/hex"
	"sort"
	"sync"
	"time"
)

// AuthorUser and AuthorAgent enumerate Comment.Author values. User comments
// originate from the vibediff browser UI; agent comments are written by an
// MCP client through the reply_to_comment tool.
const (
	AuthorUser  = "user"
	AuthorAgent = "agent"
)

// StatusOpen and StatusResolved enumerate Comment.Status values. Resolution
// is user-driven only; the agent has no tool to flip status.
const (
	StatusOpen     = "open"
	StatusResolved = "resolved"
)

// Comment is a review note anchored to a file, line range, and (optionally)
// a specific revision. Revision/Commit pin the point-in-time the user was
// looking at when the comment was created so consumers can render the
// original code even after the working copy drifts.
type Comment struct {
	ID        string    `json:"id"`
	File      string    `json:"file"`
	Line      int       `json:"line,omitempty"`
	LineEnd   int       `json:"lineEnd,omitempty"`
	Side      string    `json:"side,omitempty"`
	Content   string    `json:"content"`
	Author    string    `json:"author"`
	ParentID  string    `json:"parentId,omitempty"`
	Status    string    `json:"status"`
	Revision  string    `json:"revision,omitempty"`
	Commit    string    `json:"commit,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

// Subscriber receives a callback after a comment is added to the store.
// Subscribers are durable — they fire on every AddComment until the
// caller invokes the unsubscribe function returned by Subscribe.
// Subscribers run in a goroutine so a slow subscriber cannot block
// AddComment, and a panicking subscriber cannot bring down the writer.
type Subscriber func(*Comment)

// subscription pairs a Subscriber callback with an opaque id used to
// remove it on unsubscribe. Slice rather than map because iteration is
// the hot path and the active subscriber count is small (a few at most:
// the WebSocket hub plus any in-flight wait_for_comment waiters).
type subscription struct {
	id uint64
	fn Subscriber
}

type Store struct {
	mu       sync.RWMutex
	comments map[string]*Comment
	// tombstones records the CreatedAt of comments removed via
	// DeleteComment. Kept indefinitely so wait_for_comment cursors that
	// point at a deleted comment continue to resolve to the right
	// timestamp threshold. Without this, the agent's cursor would
	// silently fall back to "no cursor" after every delete and re-
	// deliver the entire backlog on the next wait_for_comment call.
	tombstones map[string]time.Time

	subsMu    sync.RWMutex
	subs      []subscription
	nextSubID uint64
}

func NewStore() *Store {
	return &Store{
		comments:   make(map[string]*Comment),
		tombstones: make(map[string]time.Time),
	}
}

// Subscribe registers a durable callback that fires on every AddComment.
// Returns an unsubscribe function the caller must invoke when done; the
// store does not auto-remove subscribers. Used by two consumers with
// different lifecycles:
//
//   - The WebSocket hub registers once at startup so the UI re-fetches
//     comments whenever an agent reply or other server-side write lands.
//     It never unsubscribes.
//   - The wait_for_comment MCP handler subscribes per call and
//     unsubscribes via defer.
//
// The unsubscribe function is idempotent and safe to call after the
// store has been cleared.
func (s *Store) Subscribe(fn Subscriber) func() {
	s.subsMu.Lock()
	defer s.subsMu.Unlock()
	s.nextSubID++
	id := s.nextSubID
	s.subs = append(s.subs, subscription{id: id, fn: fn})
	return func() {
		s.subsMu.Lock()
		defer s.subsMu.Unlock()
		for i, sub := range s.subs {
			if sub.id == id {
				s.subs = append(s.subs[:i], s.subs[i+1:]...)
				return
			}
		}
	}
}

// snapshotSubscribers copies the current subscriber list so the caller
// can iterate without holding the lock — important because subscriber
// callbacks may attempt to subscribe or unsubscribe.
func (s *Store) snapshotSubscribers() []subscription {
	s.subsMu.RLock()
	defer s.subsMu.RUnlock()
	out := make([]subscription, len(s.subs))
	copy(out, s.subs)
	return out
}

// AddComment assigns an ID, applies defaults, and stores the comment.
// Callers may post partial payloads; Author defaults to "user" and Status
// defaults to "open" so existing UI clients written before these fields
// existed continue to work unmodified.
func (s *Store) AddComment(comment *Comment) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if comment.Author == "" {
		comment.Author = AuthorUser
	}
	if comment.Status == "" {
		comment.Status = StatusOpen
	}

	comment.ID = generateID()
	comment.CreatedAt = time.Now()
	s.comments[comment.ID] = comment

	// Fan out to durable subscribers off the write path. AddComment
	// returns immediately; subscribers run concurrently in their own
	// goroutines. Filtering (user vs agent, status) is the subscriber's
	// responsibility — the store delivers every AddComment to every
	// active subscriber.
	for _, sub := range s.snapshotSubscribers() {
		go sub.fn(comment)
	}
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

// GetByID returns the comment with the given ID, or nil if no such
// comment exists. The returned pointer is the live store entry and should
// be treated as read-only.
func (s *Store) GetByID(id string) *Comment {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.comments[id]
}

// LatestOpenComment returns the single most recently created open
// comment, or nil if none exist. Used by the /api/review/comments/latest
// HTTP endpoint that hook scripts poll for new arrivals.
func (s *Store) LatestOpenComment() *Comment {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var latest *Comment
	for _, c := range s.comments {
		if c.Status != StatusOpen {
			continue
		}
		if latest == nil || c.CreatedAt.After(latest.CreatedAt) {
			latest = c
		}
	}
	return latest
}

// UserCommentsAfter returns user-authored, status-open comments created
// after the comment identified by sinceID, in creation order (oldest
// first). An empty or unknown sinceID returns all matching comments.
// If the sinceID matches a tombstone (set when a comment was deleted
// via DeleteComment), the tombstone's recorded CreatedAt is used as
// the threshold so a deleted-cursor case continues to filter correctly
// instead of degrading to a full redelivery.
//
// Used by the wait_for_comment MCP tool to drain the backlog and to
// re-query after a subscriber wake.
func (s *Store) UserCommentsAfter(sinceID string) []*Comment {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var threshold time.Time
	if sinceID != "" {
		if c, ok := s.comments[sinceID]; ok {
			threshold = c.CreatedAt
		} else if t, ok := s.tombstones[sinceID]; ok {
			threshold = t
		}
	}

	out := make([]*Comment, 0)
	for _, c := range s.comments {
		if c.Author != AuthorUser {
			continue
		}
		if c.Status != StatusOpen {
			continue
		}
		if !c.CreatedAt.After(threshold) {
			continue
		}
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt.Before(out[j].CreatedAt)
	})
	return out
}

// GetCommentsByStatus returns comments with the given status. Used by the
// /comments/open and /comments/resolved HTTP routes and by the MCP tool
// list_open_comments.
func (s *Store) GetCommentsByStatus(status string) []*Comment {
	s.mu.RLock()
	defer s.mu.RUnlock()

	comments := make([]*Comment, 0)
	for _, c := range s.comments {
		if c.Status == status {
			comments = append(comments, c)
		}
	}
	return comments
}

// SetStatus updates a comment's status. Returns false if the comment was
// not found. Resolution is invoked from the UI; the agent has no tool to
// flip status.
func (s *Store) SetStatus(id, status string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	c, ok := s.comments[id]
	if !ok {
		return false
	}
	c.Status = status
	return true
}

// DeleteComment removes a comment and, if the target is a thread root,
// cascades the removal to every reply. Single deletions of replies
// remove only the reply. Tombstones the deleted root's CreatedAt so
// wait_for_comment cursors pointing at it remain resolvable after the
// comment is gone — without this, the agent's next call would fall
// back to "no cursor" and redeliver the entire backlog.
//
// Fires subscribers with a nil comment so the WS hub broadcasts a
// comment_changed event and connected browser tabs re-fetch. The
// cascade-for-roots behavior is what keeps the UI thread coherent: a
// user clicking × on a parent must not leave the agent's reply
// orphaned in the diff view.
func (s *Store) DeleteComment(id string) bool {
	s.mu.Lock()

	c, exists := s.comments[id]
	if !exists {
		s.mu.Unlock()
		return false
	}
	s.tombstones[id] = c.CreatedAt
	delete(s.comments, id)
	if c.ParentID == "" {
		for childID, child := range s.comments {
			if child.ParentID == id {
				delete(s.comments, childID)
			}
		}
	}
	s.mu.Unlock()

	for _, sub := range s.snapshotSubscribers() {
		go sub.fn(nil)
	}
	return true
}

// Clear removes all comments from the store
func (s *Store) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.comments = make(map[string]*Comment)
}

func generateID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		// Fallback to timestamp if crypto/rand fails
		return time.Now().Format("20060102150405.999999999")
	}
	return hex.EncodeToString(b)
}
