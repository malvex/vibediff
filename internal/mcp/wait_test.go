package mcp

import (
	"context"
	"testing"
	"time"

	"github.com/mark3labs/mcp-go/mcp"

	"github.com/malvex/vibediff/internal/review"
)

// stubHunks short-circuits the hunk provider in tests so wait_for_comment
// doesn't reach into git. The handler still attaches DiffHunk when the
// provider returns one; passing nil here keeps responses lean.
type stubHunks struct{}

func (stubHunks) HunkFor(context.Context, *review.Comment) (Hunk, error) {
	return Hunk{}, nil
}

func newTestServer() (*Server, *review.Store) {
	store := review.NewStore()
	s := New(store, nil, stubHunks{})
	return s, store
}

// waitResponse is the decoded shape callWait returns to test bodies.
// Mirrors what an MCP client sees: a batch of comments and the cursor
// the client must echo back on the next call.
type waitResponse struct {
	batch       []CommentResponse
	nextSinceID string
}

func callWait(t *testing.T, s *Server, ctx context.Context, sinceID string, timeoutSec int) waitResponse {
	t.Helper()
	args := map[string]any{}
	if sinceID != "" {
		args["since_id"] = sinceID
	}
	if timeoutSec > 0 {
		args["timeout_sec"] = timeoutSec
	}
	req := mcp.CallToolRequest{}
	req.Params.Arguments = args

	result, err := s.handleWaitForComment(ctx, req)
	if err != nil {
		t.Fatalf("handleWaitForComment: %v", err)
	}
	if result == nil {
		t.Fatal("result is nil")
	}
	structured, ok := result.StructuredContent.(map[string]any)
	if !ok {
		t.Fatalf("structured content shape: %T", result.StructuredContent)
	}
	raw, ok := structured["comments"]
	if !ok {
		t.Fatal("missing comments key")
	}
	batch, ok := raw.([]CommentResponse)
	if !ok {
		t.Fatalf("comments wrong type: %T", raw)
	}
	cursor, _ := structured["next_since_id"].(string)
	return waitResponse{batch: batch, nextSinceID: cursor}
}

// TestWaitForCommentReturnsBacklogImmediately covers the fast path: a
// backlog exists at call time, so the handler returns without blocking
// regardless of the configured timeout.
func TestWaitForCommentReturnsBacklogImmediately(t *testing.T) {
	s, store := newTestServer()

	c := &review.Comment{File: "a.go", Content: "look here"}
	store.AddComment(c)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	start := time.Now()
	resp := callWait(t, s, ctx, "", 60)
	elapsed := time.Since(start)

	if elapsed > 100*time.Millisecond {
		t.Fatalf("backlog branch took %s, should be near-instant", elapsed)
	}
	if len(resp.batch) != 1 || resp.batch[0].ID != c.ID {
		t.Fatalf("got %v, want single comment %s", resp.batch, c.ID)
	}
	if resp.nextSinceID != c.ID {
		t.Fatalf("next_since_id = %q, want %q (last user comment in batch)", resp.nextSinceID, c.ID)
	}
}

// TestWaitForCommentBlocksThenWakes covers the wait path: no backlog, the
// handler blocks, an AddComment from another goroutine wakes it, the
// returned batch contains the new comment.
func TestWaitForCommentBlocksThenWakes(t *testing.T) {
	s, store := newTestServer()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	done := make(chan waitResponse, 1)
	go func() {
		done <- callWait(t, s, ctx, "", 5)
	}()

	// Give the handler time to subscribe and observe an empty backlog.
	time.Sleep(50 * time.Millisecond)

	c := &review.Comment{File: "b.go", Content: "wake up"}
	store.AddComment(c)

	select {
	case r := <-done:
		if len(r.batch) != 1 || r.batch[0].ID != c.ID {
			t.Fatalf("got %v, want single comment %s", r.batch, c.ID)
		}
		if r.nextSinceID != c.ID {
			t.Fatalf("next_since_id = %q, want %q", r.nextSinceID, c.ID)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("handler did not wake on AddComment")
	}
}

// TestWaitForCommentTimeoutReturnsEmpty confirms an empty array (not an
// error) on timeout — the Claude-side loop depends on this to re-call
// without error handling.
func TestWaitForCommentTimeoutReturnsEmpty(t *testing.T) {
	s, _ := newTestServer()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	resp := callWait(t, s, ctx, "", 1)
	if len(resp.batch) != 0 {
		t.Fatalf("got %d comments on timeout, want 0", len(resp.batch))
	}
	if resp.nextSinceID != "" {
		t.Fatalf("next_since_id = %q on empty timeout with empty since_id, want pass-through empty", resp.nextSinceID)
	}
}

// TestWaitForCommentIgnoresAgentReplies guards the wake filter: an agent
// reply landing while a waiter is parked must not wake it. Otherwise
// reply_to_comment would loop the agent back to its own reply.
func TestWaitForCommentIgnoresAgentReplies(t *testing.T) {
	s, store := newTestServer()

	parent := &review.Comment{File: "a.go", Content: "original"}
	store.AddComment(parent)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	done := make(chan waitResponse, 1)
	go func() {
		done <- callWait(t, s, ctx, parent.ID, 1)
	}()

	time.Sleep(50 * time.Millisecond)
	store.AddComment(&review.Comment{
		File:     "a.go",
		Content:  "agent reply",
		Author:   review.AuthorAgent,
		ParentID: parent.ID,
	})

	select {
	case r := <-done:
		if len(r.batch) != 0 {
			t.Fatalf("agent reply woke waiter: got %v", r.batch)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("handler did not return")
	}
}

// TestWaitForCommentCursorAdvances covers the resume contract: pass the
// last-seen ID, the next call returns only newer comments.
func TestWaitForCommentCursorAdvances(t *testing.T) {
	s, store := newTestServer()

	first := &review.Comment{File: "a.go", Content: "first"}
	store.AddComment(first)
	time.Sleep(time.Millisecond)
	second := &review.Comment{File: "a.go", Content: "second"}
	store.AddComment(second)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	resp := callWait(t, s, ctx, first.ID, 60)
	if len(resp.batch) != 1 || resp.batch[0].ID != second.ID {
		t.Fatalf("got %v, want single comment %s", resp.batch, second.ID)
	}
	if resp.nextSinceID != second.ID {
		t.Fatalf("next_since_id = %q, want %q", resp.nextSinceID, second.ID)
	}
}

// TestWaitForCommentCursorSurvivesDeletion guards the delete_comment
// flow: an agent that drains a batch, acts on it, and deletes the
// thread must be able to use the cursor from the wait_for_comment
// response on its next call without re-receiving everything. Tombstones
// in review.Store keep the threshold lookup correct after the comment
// is gone.
func TestWaitForCommentCursorSurvivesDeletion(t *testing.T) {
	s, store := newTestServer()

	first := &review.Comment{File: "a.go", Content: "first"}
	store.AddComment(first)
	time.Sleep(time.Millisecond)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	initial := callWait(t, s, ctx, "", 60)
	if len(initial.batch) != 1 || initial.batch[0].ID != first.ID {
		t.Fatalf("initial batch = %v, want [%s]", initial.batch, first.ID)
	}
	if !store.DeleteComment(first.ID) {
		t.Fatal("DeleteComment failed for thread root")
	}

	// Cursor still references first.ID — which no longer exists in the
	// comments map. The tombstone lookup keeps the threshold correct,
	// so no backlog is redelivered.
	resp := callWait(t, s, ctx, initial.nextSinceID, 1)
	if len(resp.batch) != 0 {
		t.Fatalf("after delete + cursor=%s: got %d comments, want 0", initial.nextSinceID, len(resp.batch))
	}

	// And a new comment after the deletion is still picked up.
	second := &review.Comment{File: "a.go", Content: "second after delete"}
	store.AddComment(second)
	resp = callWait(t, s, ctx, initial.nextSinceID, 60)
	if len(resp.batch) != 1 || resp.batch[0].ID != second.ID {
		t.Fatalf("post-delete new comment: got %v, want [%s]", resp.batch, second.ID)
	}
}

// TestWaitForCommentCursorIsServerEmitted exercises the bug fix: the agent
// must never compute the cursor from a reply_to_comment result. The
// server emits next_since_id pointing at the latest USER comment in the
// batch, ignoring any agent reply that landed during the agent's
// processing turn. Using an agent reply ID as a cursor would strand any
// user comment with a CreatedAt earlier than the reply's.
func TestWaitForCommentCursorIsServerEmitted(t *testing.T) {
	s, store := newTestServer()

	user1 := &review.Comment{File: "a.go", Content: "user1"}
	store.AddComment(user1)
	time.Sleep(time.Millisecond)
	user2 := &review.Comment{File: "a.go", Content: "user2 added while agent busy"}
	store.AddComment(user2)
	time.Sleep(time.Millisecond)
	// Agent reply created last, so its CreatedAt is the latest in the
	// store. If next_since_id were derived from "the most recently seen
	// comment of any kind", it would advance past user2 and strand it.
	store.AddComment(&review.Comment{
		File:     "a.go",
		Content:  "agent reply to user1",
		Author:   review.AuthorAgent,
		ParentID: user1.ID,
	})

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	resp := callWait(t, s, ctx, "", 60)

	if len(resp.batch) != 2 {
		t.Fatalf("got %d comments, want 2 (both user comments)", len(resp.batch))
	}
	if resp.batch[0].ID != user1.ID || resp.batch[1].ID != user2.ID {
		t.Fatalf("batch order = [%s, %s], want [%s, %s]", resp.batch[0].ID, resp.batch[1].ID, user1.ID, user2.ID)
	}
	if resp.nextSinceID != user2.ID {
		t.Fatalf("next_since_id = %q, want %q (latest USER comment, not agent reply)", resp.nextSinceID, user2.ID)
	}
}
