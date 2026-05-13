package review

import (
	"sync"
	"testing"
	"time"
)

// TestUserCommentsAfter exercises the cursor semantics that
// wait_for_comment depends on: empty sinceID returns all matching, a known
// sinceID returns strictly newer entries in creation order, and an unknown
// sinceID degrades to the empty-sinceID behavior so a deleted cursor
// can't strand a poller.
func TestUserCommentsAfter(t *testing.T) {
	s := NewStore()

	first := &Comment{File: "a.go", Content: "first"}
	s.AddComment(first)
	time.Sleep(time.Millisecond)

	agent := &Comment{File: "a.go", Content: "agent reply", Author: AuthorAgent}
	s.AddComment(agent)
	time.Sleep(time.Millisecond)

	second := &Comment{File: "a.go", Content: "second"}
	s.AddComment(second)
	time.Sleep(time.Millisecond)

	resolved := &Comment{File: "a.go", Content: "resolved"}
	s.AddComment(resolved)
	s.SetStatus(resolved.ID, StatusResolved)

	testCases := []struct {
		name    string
		sinceID string
		wantIDs []string
	}{
		{
			name:    "empty sinceID returns all user-open in order",
			sinceID: "",
			wantIDs: []string{first.ID, second.ID},
		},
		{
			name:    "known sinceID returns strictly newer",
			sinceID: first.ID,
			wantIDs: []string{second.ID},
		},
		{
			name:    "cursor at newest returns nothing",
			sinceID: second.ID,
			wantIDs: nil,
		},
		{
			name:    "unknown sinceID degrades to empty-sinceID",
			sinceID: "deadbeefdeadbeef",
			wantIDs: []string{first.ID, second.ID},
		},
		{
			name:    "agent-authored sinceID still filters agent out of result",
			sinceID: agent.ID,
			wantIDs: []string{second.ID},
		},
	}

	for _, test := range testCases {
		t.Run(test.name, func(t *testing.T) {
			got := s.UserCommentsAfter(test.sinceID)
			if len(got) != len(test.wantIDs) {
				t.Fatalf("len = %d, want %d (%v)", len(got), len(test.wantIDs), idsOf(got))
			}
			for i, want := range test.wantIDs {
				if got[i].ID != want {
					t.Fatalf("[%d].ID = %q, want %q", i, got[i].ID, want)
				}
			}
		})
	}
}

// TestSubscribersFireOnEveryAdd verifies that Subscribe is durable: each
// registration fires on every subsequent AddComment until the returned
// unsubscribe function is called.
func TestSubscribersFireOnEveryAdd(t *testing.T) {
	s := NewStore()

	var (
		mu    sync.Mutex
		calls int
	)
	unsub := s.Subscribe(func(*Comment) {
		mu.Lock()
		calls++
		mu.Unlock()
	})
	defer unsub()

	s.AddComment(&Comment{Content: "one"})
	s.AddComment(&Comment{Content: "two"})
	s.AddComment(&Comment{Content: "three"})

	waitFor(t, func() bool {
		mu.Lock()
		defer mu.Unlock()
		return calls == 3
	})

	mu.Lock()
	got := calls
	mu.Unlock()
	if got != 3 {
		t.Fatalf("subscriber fired %d times, want 3 (durable subscription)", got)
	}
}

// TestUnsubscribeStopsDelivery covers the wait_for_comment-style
// lifecycle: subscribe, get one event, unsubscribe, ensure subsequent
// AddComments don't deliver to the dead subscription.
func TestUnsubscribeStopsDelivery(t *testing.T) {
	s := NewStore()

	wake := make(chan struct{}, 4)
	unsub := s.Subscribe(func(*Comment) { wake <- struct{}{} })

	s.AddComment(&Comment{Content: "one"})
	select {
	case <-wake:
	case <-time.After(time.Second):
		t.Fatal("subscriber did not fire on first AddComment")
	}

	unsub()

	s.AddComment(&Comment{Content: "two"})
	select {
	case <-wake:
		t.Fatal("subscriber fired after unsubscribe")
	case <-time.After(50 * time.Millisecond):
	}
}

// TestUnsubscribeIsIdempotent verifies that calling unsubscribe twice
// (e.g. an explicit call followed by a defer) is safe.
func TestUnsubscribeIsIdempotent(t *testing.T) {
	s := NewStore()
	unsub := s.Subscribe(func(*Comment) {})
	unsub()
	unsub()
}

// TestMultipleSubscribersIndependent makes sure unsubscribe targets only
// the caller's subscription. The WS hub and a wait_for_comment handler
// coexist in production; one going away must not silence the other.
func TestMultipleSubscribersIndependent(t *testing.T) {
	s := NewStore()

	wakeA := make(chan struct{}, 4)
	wakeB := make(chan struct{}, 4)
	unsubA := s.Subscribe(func(*Comment) { wakeA <- struct{}{} })
	unsubB := s.Subscribe(func(*Comment) { wakeB <- struct{}{} })
	defer unsubB()

	s.AddComment(&Comment{Content: "one"})
	select {
	case <-wakeA:
	case <-time.After(time.Second):
		t.Fatal("subscriber A did not fire")
	}
	select {
	case <-wakeB:
	case <-time.After(time.Second):
		t.Fatal("subscriber B did not fire")
	}

	unsubA()

	s.AddComment(&Comment{Content: "two"})
	select {
	case <-wakeA:
		t.Fatal("A fired after unsubscribe")
	case <-time.After(50 * time.Millisecond):
	}
	select {
	case <-wakeB:
	case <-time.After(time.Second):
		t.Fatal("B did not fire after A unsubscribed")
	}
}

// TestLatestOpenComment confirms the helper the /comments/latest HTTP
// endpoint depends on returns the newest open comment regardless of
// insertion order and ignores resolved comments.
func TestLatestOpenComment(t *testing.T) {
	s := NewStore()

	if got := s.LatestOpenComment(); got != nil {
		t.Fatalf("empty store: got %v, want nil", got)
	}

	old := &Comment{Content: "old"}
	s.AddComment(old)
	time.Sleep(time.Millisecond)
	newer := &Comment{Content: "newer"}
	s.AddComment(newer)
	time.Sleep(time.Millisecond)
	newest := &Comment{Content: "newest-but-resolved"}
	s.AddComment(newest)
	s.SetStatus(newest.ID, StatusResolved)

	got := s.LatestOpenComment()
	if got == nil || got.ID != newer.ID {
		t.Fatalf("got %v, want %v", got, newer)
	}
}

// TestDeleteCommentCascadesRepliesForRoot makes the cascade contract
// explicit: removing a thread root drops every agent reply pointing at
// it via ParentID. The cascade applies whether the deletion came from
// the user clicking × in the UI or the agent calling delete_comment —
// without it, the UI strands the agent's reply as a top-level OPEN
// comment after the user closes the parent.
func TestDeleteCommentCascadesRepliesForRoot(t *testing.T) {
	s := NewStore()

	parent := &Comment{File: "a.go", Content: "fix this"}
	s.AddComment(parent)

	reply1 := &Comment{File: "a.go", Content: "fixed", Author: AuthorAgent, ParentID: parent.ID}
	s.AddComment(reply1)
	reply2 := &Comment{File: "a.go", Content: "and noted", Author: AuthorAgent, ParentID: parent.ID}
	s.AddComment(reply2)

	other := &Comment{File: "b.go", Content: "unrelated"}
	s.AddComment(other)

	if !s.DeleteComment(parent.ID) {
		t.Fatal("DeleteComment returned false on a valid thread root")
	}

	if c := s.GetByID(parent.ID); c != nil {
		t.Fatalf("parent still present after DeleteComment: %v", c)
	}
	if c := s.GetByID(reply1.ID); c != nil {
		t.Fatalf("reply1 still present after DeleteComment on root: %v", c)
	}
	if c := s.GetByID(reply2.ID); c != nil {
		t.Fatalf("reply2 still present after DeleteComment on root: %v", c)
	}
	if c := s.GetByID(other.ID); c == nil {
		t.Fatal("unrelated comment was deleted by DeleteComment cascade")
	}
}

// TestDeleteCommentLeavesParentForReply checks the other half of the
// cascade rule: deleting a reply removes only that reply, never its
// parent or sibling replies. This matches the UI affordance — a user
// who clicks × on an agent reply expects to drop just that reply.
func TestDeleteCommentLeavesParentForReply(t *testing.T) {
	s := NewStore()

	parent := &Comment{Content: "parent"}
	s.AddComment(parent)
	reply1 := &Comment{Content: "first reply", Author: AuthorAgent, ParentID: parent.ID}
	s.AddComment(reply1)
	reply2 := &Comment{Content: "second reply", Author: AuthorAgent, ParentID: parent.ID}
	s.AddComment(reply2)

	if !s.DeleteComment(reply1.ID) {
		t.Fatal("DeleteComment returned false on a valid reply")
	}
	if c := s.GetByID(parent.ID); c == nil {
		t.Fatal("parent was deleted when caller targeted a reply")
	}
	if c := s.GetByID(reply2.ID); c == nil {
		t.Fatal("sibling reply was deleted when caller targeted reply1")
	}
}

// TestDeleteCommentTombstoneKeepsCursorValid is the wait_for_comment
// regression: after the agent's batch is processed and the comment
// deleted, the next wait_for_comment call uses the deleted ID as its
// cursor. Without tombstones, UserCommentsAfter would fall back to
// "no threshold" and re-deliver everything that's still open.
func TestDeleteCommentTombstoneKeepsCursorValid(t *testing.T) {
	s := NewStore()

	first := &Comment{Content: "first"}
	s.AddComment(first)
	time.Sleep(time.Millisecond)
	second := &Comment{Content: "second (processed and deleted)"}
	s.AddComment(second)
	time.Sleep(time.Millisecond)

	if !s.DeleteComment(second.ID) {
		t.Fatal("DeleteComment returned false")
	}

	// Cursor pinned at the now-deleted comment should still filter
	// `first` (older than the tombstone) out of the result.
	got := s.UserCommentsAfter(second.ID)
	if len(got) != 0 {
		t.Fatalf("cursor at deleted comment returned %d, want 0 (tombstone failed)", len(got))
	}

	// A new user comment after the deletion should still come through.
	third := &Comment{Content: "third"}
	s.AddComment(third)
	got = s.UserCommentsAfter(second.ID)
	if len(got) != 1 || got[0].ID != third.ID {
		t.Fatalf("cursor at tombstone failed to surface newer comment: got %v", idsOf(got))
	}
}

// TestDeleteCommentNotifiesSubscribers covers the WS-broadcast path:
// deletion must wake durable subscribers with a nil comment so the WS
// hub re-broadcasts and connected browser tabs re-fetch. Otherwise the
// deleted thread would linger in the UI until manual refresh.
func TestDeleteCommentNotifiesSubscribers(t *testing.T) {
	s := NewStore()
	parent := &Comment{Content: "p"}
	s.AddComment(parent)

	received := make(chan *Comment, 4)
	unsub := s.Subscribe(func(c *Comment) { received <- c })
	defer unsub()

	if !s.DeleteComment(parent.ID) {
		t.Fatal("DeleteComment returned false")
	}

	select {
	case c := <-received:
		if c != nil {
			t.Fatalf("expected nil comment on deletion event, got %v", c)
		}
	case <-time.After(time.Second):
		t.Fatal("subscriber not notified on DeleteComment")
	}
}

func idsOf(cs []*Comment) []string {
	out := make([]string, len(cs))
	for i, c := range cs {
		out[i] = c.ID
	}
	return out
}

// waitFor polls cond until it returns true or the deadline expires. Used
// to bridge the goroutine-dispatched subscriber callbacks without sleep
// constants littered through the tests.
func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("condition not met within deadline")
}
