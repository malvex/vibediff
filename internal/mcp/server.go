// Package mcp embeds an MCP (Model Context Protocol) server inside the
// vibediff binary. The server exposes the review-comment surface as MCP
// tools and resources so an MCP client (Claude Code) can read open
// comments, post agent-authored replies, and re-fetch diff hunks for
// individual comments.
//
// Transport is Streamable HTTP, mounted alongside the existing REST API on
// the same listener. Status mutation is intentionally absent from the tool
// surface; resolve is user-driven through the vibediff UI.
package mcp

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"github.com/malvex/vibediff/internal/git"
	"github.com/malvex/vibediff/internal/review"
)

// waitTimeoutDefault is the wait_for_comment timeout used when the client
// passes no timeout_sec. Picked to stay well under typical HTTP idle
// limits while still letting an idle session park most of its time inside
// a single blocking call.
const waitTimeoutDefault = 300

// waitTimeoutMax bounds the wait_for_comment timeout regardless of what
// the client requests. Prevents pathologically long hangs that confuse
// MCP clients or intermediate HTTP plumbing.
const waitTimeoutMax = 600

// HunkProvider produces a diff hunk and drift signal for a given comment.
// The MCP server delegates to this interface rather than calling git
// directly so the hunk generation in internal/mcp/hunk.go can evolve
// without churning the MCP wiring.
type HunkProvider interface {
	HunkFor(ctx context.Context, c *review.Comment) (Hunk, error)
}

// Hunk is the per-comment diff context returned alongside a comment.
// Truncated is reserved for a future hard cap; Drifted indicates that the
// pinned-commit content at the comment's coordinates no longer matches
// current working copy.
type Hunk struct {
	Text      string `json:"text"`
	Truncated bool   `json:"truncated"`
	Drifted   bool   `json:"drifted"`
}

// CommentResponse is the wire shape returned to MCP clients. It embeds the
// stored Comment fields verbatim and adds the response-time diff context.
type CommentResponse struct {
	*review.Comment
	DiffHunk  string `json:"diffHunk"`
	Truncated bool   `json:"truncated"`
	Drifted   bool   `json:"drifted"`
}

// Server wraps an MCP server configured with the vibediff tool surface.
// One Server is shared across all MCP clients, but vibediff only accepts
// one concurrent session per the 1:1 design constraint (see acceptSession).
type Server struct {
	mcp      *server.MCPServer
	http     *server.StreamableHTTPServer
	store    *review.Store
	gitSvc   *git.Service
	hunks    HunkProvider
	sessions atomic.Int32
}

// New constructs an MCP server wired to the supplied review store and git
// service. Call Handler() to obtain an http.Handler that the main router
// can mount under /mcp.
func New(store *review.Store, gitSvc *git.Service, hunks HunkProvider) *Server {
	s := &Server{
		store:  store,
		gitSvc: gitSvc,
		hunks:  hunks,
	}

	s.mcp = server.NewMCPServer(
		"vibediff",
		"0.1.0",
		server.WithToolCapabilities(false),
		server.WithResourceCapabilities(false, false),
	)

	s.registerTools()
	s.registerResources()

	s.http = server.NewStreamableHTTPServer(
		s.mcp,
		server.WithEndpointPath("/mcp"),
		server.WithStateLess(false),
	)

	return s
}

// Handler returns the HTTP handler that serves MCP traffic. Mount under
// the path passed to NewStreamableHTTPServer (default: /mcp).
func (s *Server) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Best-effort 1:1 enforcement: refuse a second initialize while a
		// session is already active. Tool/resource calls on the existing
		// session continue to flow.
		if isInitializeRequest(r) && !s.acceptSession() {
			http.Error(w, "vibediff MCP server already has a client", http.StatusConflict)
			return
		}
		s.http.ServeHTTP(w, r)
	})
}

// acceptSession atomically claims the single session slot. Returns true if
// the caller now owns the session; false if another client is already
// connected. Sessions are released on disconnect via releaseSession.
func (s *Server) acceptSession() bool {
	return s.sessions.CompareAndSwap(0, 1)
}

// releaseSession returns the session slot to the pool. Currently unused —
// the streamable-http library does not expose a per-session disconnect
// hook the way SSE does, so v1 holds the slot until the server restarts.
// Future work: wire this to a session-close callback so vibediff can
// reclaim the slot on client disconnect.
func (s *Server) releaseSession() {
	s.sessions.Store(0)
}

func (s *Server) registerTools() {
	listTool := mcp.NewTool(
		"list_open_comments",
		mcp.WithDescription("Return all open review comments from the active vibediff instance, each carrying its pinned-commit diff hunk."),
	)
	s.mcp.AddTool(listTool, s.handleListOpenComments)

	replyTool := mcp.NewTool(
		"reply_to_comment",
		mcp.WithDescription("Post an agent-authored reply as a child of an existing comment."),
		mcp.WithString("parent_id",
			mcp.Required(),
			mcp.Description("ID of the comment being replied to."),
		),
		mcp.WithString("content",
			mcp.Required(),
			mcp.Description("Reply body. Markdown is allowed."),
		),
	)
	s.mcp.AddTool(replyTool, s.handleReplyToComment)

	hunkTool := mcp.NewTool(
		"get_full_hunk",
		mcp.WithDescription("Return the diff hunk for a single comment in the same shape inlined by list_open_comments."),
		mcp.WithString("comment_id",
			mcp.Required(),
			mcp.Description("ID of the comment whose hunk to fetch."),
		),
	)
	s.mcp.AddTool(hunkTool, s.handleGetFullHunk)

	deleteTool := mcp.NewTool(
		"delete_comment",
		mcp.WithDescription("Delete a comment thread (the user comment together with any agent replies). Call this after you have addressed the comment in code and have nothing to ask. The user sees the comment vanish, signalling the change is done. Prefer this over reply_to_comment when the request is unambiguous and you have completed it. Use reply_to_comment instead when you have a clarifying question, are leaving a record of a partial change, or disagree with the request — those cases need the comment to stay open so the user can react."),
		mcp.WithString("comment_id",
			mcp.Required(),
			mcp.Description("ID of the comment thread to delete. Must be a thread root (parentId is empty); the deletion cascades to any agent replies. Trying to delete a reply directly returns an error."),
		),
	)
	s.mcp.AddTool(deleteTool, s.handleDeleteComment)

	waitTool := mcp.NewTool(
		"wait_for_comment",
		mcp.WithDescription("Block until a new user-authored open comment lands, then return the batch of comments newer than since_id along with a next_since_id cursor for the following call. Returns immediately if a backlog already exists; returns an empty comments array on timeout (next_since_id is unchanged). Designed to be called in a loop so an agent stays responsive to UI activity without polling.\n\nLOOP CONTRACT: on every call, pass the next_since_id value the previous response gave you. Do not substitute IDs from list_open_comments, reply_to_comment, or other tools — those may point at agent replies, and using them as cursors will silently drop user comments added while you were busy."),
		mcp.WithString("since_id",
			mcp.Description("Cursor returned by the previous wait_for_comment call as next_since_id. Empty/omitted on the first call: returns all currently open user comments immediately."),
		),
		mcp.WithNumber("timeout_sec",
			mcp.Description("Maximum seconds to wait when there is no backlog. Defaults to 300, capped at 600. On expiry the tool returns an empty comments array (not an error); call again to resume waiting."),
		),
	)
	s.mcp.AddTool(waitTool, s.handleWaitForComment)
}

func (s *Server) registerResources() {
	openResource := mcp.NewResource(
		"comments://open",
		"Open vibediff comments",
		mcp.WithResourceDescription("All currently open review comments from the vibediff UI, in JSON."),
		mcp.WithMIMEType("application/json"),
	)
	s.mcp.AddResource(openResource, s.handleOpenCommentsResource)
}

func (s *Server) handleListOpenComments(ctx context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	open := s.store.GetCommentsByStatus(review.StatusOpen)

	responses := make([]CommentResponse, 0, len(open))
	for _, c := range open {
		responses = append(responses, s.buildResponse(ctx, c))
	}

	return mcp.NewToolResultStructuredOnly(map[string]any{
		"comments": responses,
	}), nil
}

func (s *Server) handleReplyToComment(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	parentID, err := req.RequireString("parent_id")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	content, err := req.RequireString("content")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	parent := s.store.GetByID(parentID)
	if parent == nil {
		return mcp.NewToolResultError(fmt.Sprintf("comment not found: %s", parentID)), nil
	}

	reply := &review.Comment{
		File:     parent.File,
		Line:     parent.Line,
		LineEnd:  parent.LineEnd,
		Side:     parent.Side,
		Content:  content,
		Author:   review.AuthorAgent,
		ParentID: parent.ID,
		Status:   review.StatusOpen,
		Revision: parent.Revision,
		Commit:   parent.Commit,
	}
	s.store.AddComment(reply)

	return mcp.NewToolResultStructuredOnly(map[string]any{
		"comment": s.buildResponse(ctx, reply),
	}), nil
}

// handleDeleteComment removes a comment thread when the agent has acted
// on the request and has nothing to ask back. The cascade is handled
// inside review.Store.DeleteComment for thread roots; this layer only
// enforces that the target is a root so the tool can't be misused to
// delete an individual agent reply (the agent has no reason to do that
// and the error keeps a misuse turn from silently no-opping).
func (s *Server) handleDeleteComment(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	id, err := req.RequireString("comment_id")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	target := s.store.GetByID(id)
	if target == nil {
		return mcp.NewToolResultError(fmt.Sprintf("comment not found: %s", id)), nil
	}
	if target.ParentID != "" {
		return mcp.NewToolResultError("delete_comment only operates on thread roots; pass the top-level comment ID, not a reply ID"), nil
	}
	if !s.store.DeleteComment(id) {
		return mcp.NewToolResultError(fmt.Sprintf("could not delete thread: %s", id)), nil
	}
	return mcp.NewToolResultStructuredOnly(map[string]any{
		"deleted": id,
	}), nil
}

func (s *Server) handleGetFullHunk(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	commentID, err := req.RequireString("comment_id")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	c := s.store.GetByID(commentID)
	if c == nil {
		return mcp.NewToolResultError(fmt.Sprintf("comment not found: %s", commentID)), nil
	}

	resp := s.buildResponse(ctx, c)
	return mcp.NewToolResultStructuredOnly(map[string]any{
		"comment": resp,
	}), nil
}

func (s *Server) handleOpenCommentsResource(ctx context.Context, _ mcp.ReadResourceRequest) ([]mcp.ResourceContents, error) {
	open := s.store.GetCommentsByStatus(review.StatusOpen)
	responses := make([]CommentResponse, 0, len(open))
	for _, c := range open {
		responses = append(responses, s.buildResponse(ctx, c))
	}

	payload, err := encodeJSON(map[string]any{"comments": responses})
	if err != nil {
		return nil, err
	}

	return []mcp.ResourceContents{
		mcp.TextResourceContents{
			URI:      "comments://open",
			MIMEType: "application/json",
			Text:     payload,
		},
	}, nil
}

// handleWaitForComment serves the agent-driven long-poll loop. The handler
// subscribes a one-shot waiter, checks the backlog, and either returns
// immediately (backlog non-empty), blocks until AddComment wakes the
// waiter, or times out with an empty batch.
//
// The pre-wait backlog check is the race fix: a comment landing between
// Subscribe and the read of the channel is captured either by the
// subscriber send (channel becomes ready) or by the backlog query (the
// store already contains it). The subscriber's send is non-blocking
// against a buffered chan(1) so a no-longer-interested handler does not
// strand AddComment's goroutine.
func (s *Server) handleWaitForComment(
	ctx context.Context,
	req mcp.CallToolRequest,
) (
	*mcp.CallToolResult,
	error,
) {
	sinceID := req.GetString("since_id", "")
	timeoutSec := req.GetInt("timeout_sec", waitTimeoutDefault)
	if timeoutSec < 1 {
		timeoutSec = 1
	}
	if timeoutSec > waitTimeoutMax {
		timeoutSec = waitTimeoutMax
	}

	wake := make(chan struct{}, 1)
	unsubscribe := s.store.Subscribe(func(c *review.Comment) {
		if c == nil || c.Author != review.AuthorUser || c.Status != review.StatusOpen {
			return
		}
		select {
		case wake <- struct{}{}:
		default:
		}
	})
	defer unsubscribe()

	if batch := s.buildWaitBatch(ctx, sinceID); len(batch) > 0 {
		return waitResult(batch, sinceID), nil
	}

	timer := time.NewTimer(time.Duration(timeoutSec) * time.Second)
	defer timer.Stop()

	select {
	case <-wake:
		return waitResult(s.buildWaitBatch(ctx, sinceID), sinceID), nil
	case <-timer.C:
		return waitResult(nil, sinceID), nil
	case <-ctx.Done():
		return waitResult(nil, sinceID), ctx.Err()
	}
}

// buildWaitBatch returns the response shape for wait_for_comment. Same
// shape as list_open_comments (each comment plus its diff hunk) so the
// agent can act on the result without an extra tool call.
func (s *Server) buildWaitBatch(ctx context.Context, sinceID string) []CommentResponse {
	pending := s.store.UserCommentsAfter(sinceID)
	out := make([]CommentResponse, 0, len(pending))
	for _, c := range pending {
		out = append(out, s.buildResponse(ctx, c))
	}
	return out
}

// waitResult shapes the wait_for_comment response. The server emits
// next_since_id authoritatively so the agent never has to compute the
// cursor itself — passing back next_since_id verbatim on the next call
// is the contract. If the batch is empty (timeout or wake-no-match) the
// cursor passes through unchanged.
//
// Cursor correctness matters because reply_to_comment creates an agent
// comment with a CreatedAt later than the user comment it replies to.
// If the agent picked the agent reply's ID as its cursor, any user
// comment added during the agent's processing turn (CreatedAt < agent
// reply's CreatedAt) would fall behind the threshold and be silently
// dropped. Server-emitted cursors avoid that class of bug entirely:
// batch entries are always user-authored, so the cursor never advances
// past the latest user comment the agent has actually been told about.
func waitResult(batch []CommentResponse, prevSinceID string) *mcp.CallToolResult {
	nextSinceID := prevSinceID
	if len(batch) > 0 {
		nextSinceID = batch[len(batch)-1].ID
	}
	if batch == nil {
		batch = []CommentResponse{}
	}
	return mcp.NewToolResultStructuredOnly(map[string]any{
		"comments":      batch,
		"next_since_id": nextSinceID,
	})
}

// buildResponse assembles the wire shape from a stored comment, attaching
// the diff hunk and drift signal. Hunk-provider failures degrade
// gracefully — the comment is still returned, just without context.
func (s *Server) buildResponse(ctx context.Context, c *review.Comment) CommentResponse {
	resp := CommentResponse{Comment: c}
	if s.hunks == nil {
		return resp
	}
	hunk, err := s.hunks.HunkFor(ctx, c)
	if err != nil {
		return resp
	}
	resp.DiffHunk = hunk.Text
	resp.Truncated = hunk.Truncated
	resp.Drifted = hunk.Drifted
	return resp
}

// isInitializeRequest reports whether the incoming HTTP request looks like
// an MCP initialize call. The streamable-http transport routes initialize
// over POST with an empty session header; this is a best-effort heuristic
// that errs on the side of admitting follow-up calls from the active
// session.
func isInitializeRequest(r *http.Request) bool {
	if r.Method != http.MethodPost {
		return false
	}
	return r.Header.Get("Mcp-Session-Id") == ""
}

// ErrNoSession is returned when a tool handler runs outside an active
// session. Exposed for the future per-session disconnect wiring.
var ErrNoSession = errors.New("no active MCP session")
