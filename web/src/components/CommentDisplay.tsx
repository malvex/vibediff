import type { Comment } from '../types/diff'

interface CommentDisplayProps {
  comments: Comment[]
  onDelete: (id: string) => void
  onResolve?: (id: string) => void
  onReopen?: (id: string) => void
}

interface ThreadedComment {
  root: Comment
  replies: Comment[]
}

// groupIntoThreads turns a flat comment list into root+replies pairs. Root
// comments are those with no parentId; replies attach to their root by
// parentId match. Orphaned replies (parent not in the list) are rendered
// as roots so they remain visible.
function groupIntoThreads(comments: Comment[]): ThreadedComment[] {
  const byId = new Map<string, Comment>()
  for (const c of comments) {
    byId.set(c.id, c)
  }

  const threads = new Map<string, ThreadedComment>()
  const orphans: Comment[] = []

  for (const c of comments) {
    if (!c.parentId) {
      if (!threads.has(c.id)) {
        threads.set(c.id, { root: c, replies: [] })
      } else {
        threads.get(c.id)!.root = c
      }
    } else if (byId.has(c.parentId)) {
      const parentThread = threads.get(c.parentId)
      if (parentThread) {
        parentThread.replies.push(c)
      } else {
        threads.set(c.parentId, { root: byId.get(c.parentId)!, replies: [c] })
      }
    } else {
      orphans.push(c)
    }
  }

  const sortByCreated = (a: Comment, b: Comment): number =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()

  const result = Array.from(threads.values())
  for (const t of result) {
    t.replies.sort(sortByCreated)
  }
  for (const o of orphans) {
    result.push({ root: o, replies: [] })
  }
  result.sort((a, b) => sortByCreated(a.root, b.root))
  return result
}

interface CommentCardProps {
  comment: Comment
  isReply?: boolean
  onDelete: (id: string) => void
  onResolve?: (id: string) => void
  onReopen?: (id: string) => void
}

function CommentCard({ comment, isReply, onDelete, onResolve, onReopen }: CommentCardProps): React.ReactElement {
  const isAgent = comment.author === 'agent'
  const isResolved = comment.status === 'resolved'

  const accentClass = isAgent
    ? 'border-l-info'
    : 'border-l-accent'
  const rootClass = isReply
    ? 'ml-6 mt-1 bg-surface border border-edge rounded-lg overflow-hidden'
    : `bg-surface border border-edge rounded-lg border-l-[3px] ${accentClass} overflow-hidden ${isResolved ? 'opacity-60' : ''}`

  return (
    <div data-comment-id={comment.id} className={rootClass}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-raised gap-2">
        <div className="text-xs text-fg-muted flex items-center gap-1.5 flex-wrap">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${
            isAgent ? 'bg-info/20 text-info' : 'bg-accent/20 text-accent'
          }`}>
            {isAgent ? 'Agent' : 'User'}
          </span>
          {!isReply && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${
              isResolved ? 'bg-fg-subtle/20 text-fg-muted' : 'bg-success/20 text-success'
            }`}>
              {comment.status}
            </span>
          )}
          {!isReply && (
            <span>
              {comment.lineEnd !== comment.line
                ? `Lines ${Math.abs(comment.line)}–${Math.abs(comment.lineEnd)}`
                : `Line ${Math.abs(comment.line)}`}
            </span>
          )}
          <span className="text-fg-subtle">·</span>
          <span className="text-fg-subtle">{new Date(comment.createdAt).toLocaleString()}</span>
          {!isReply && comment.commit && (
            <>
              <span className="text-fg-subtle">·</span>
              <span className="text-fg-subtle font-mono" title={comment.commit}>
                {comment.revision ? `${comment.revision} ` : ''}@{comment.commit.slice(0, 7)}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isReply && onResolve && !isResolved && (
            <button
              onClick={() => { onResolve(comment.id); }}
              className="text-fg-subtle hover:text-success text-xs px-1.5 py-0.5 rounded hover:bg-success/10 transition-colors cursor-pointer border-none bg-transparent"
              title="Resolve thread"
            >
              ✓
            </button>
          )}
          {!isReply && onReopen && isResolved && (
            <button
              onClick={() => { onReopen(comment.id); }}
              className="text-fg-subtle hover:text-accent text-xs px-1.5 py-0.5 rounded hover:bg-accent/10 transition-colors cursor-pointer border-none bg-transparent"
              title="Reopen thread"
            >
              ↺
            </button>
          )}
          <button
            onClick={() => { onDelete(comment.id); }}
            className="text-fg-subtle hover:text-danger text-sm leading-none px-1 py-0.5 rounded hover:bg-danger/10 transition-colors cursor-pointer border-none bg-transparent"
            title="Delete comment"
          >
            ×
          </button>
        </div>
      </div>
      <div className="px-3 py-2 text-sm leading-relaxed text-fg whitespace-pre-wrap">
        {comment.content}
      </div>
    </div>
  )
}

export default function CommentDisplay({ comments, onDelete, onResolve, onReopen }: CommentDisplayProps): React.ReactElement | null {
  if (comments.length === 0) return null

  const threads = groupIntoThreads(comments)

  return (
    <div className="mx-4 my-2 space-y-2">
      {threads.map(thread => (
        <div key={thread.root.id}>
          <CommentCard
            comment={thread.root}
            onDelete={onDelete}
            onResolve={onResolve}
            onReopen={onReopen}
          />
          {thread.replies.map(reply => (
            <CommentCard
              key={reply.id}
              comment={reply}
              isReply
              onDelete={onDelete}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
