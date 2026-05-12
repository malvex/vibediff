import type { Comment } from '../types/diff'

interface CommentDisplayProps {
  comments: Comment[]
  onDelete: (id: string) => void
}

export default function CommentDisplay({ comments, onDelete }: CommentDisplayProps): React.ReactElement | null {
  if (comments.length === 0) return null

  return (
    <div className="sticky left-0 w-[calc(100vw-var(--sidebar-width,20%)-2rem)] mx-4 my-2 space-y-2">
      {comments.map(comment => (
        <div
          key={comment.id}
          data-comment-id={comment.id}
          className="bg-surface border border-edge rounded-lg border-l-[3px] border-l-accent overflow-hidden"
        >
          <div className="flex items-center justify-between px-3 py-1.5 bg-surface-raised">
            <span className="text-xs text-fg-muted">
              {comment.lineEnd !== comment.line
                ? `Lines ${Math.abs(comment.line)}–${Math.abs(comment.lineEnd)}`
                : `Line ${Math.abs(comment.line)}`}
              <span className="mx-1.5 text-fg-subtle">·</span>
              <span className="text-fg-subtle">{new Date(comment.createdAt).toLocaleString()}</span>
            </span>
            <button
              onClick={() => { onDelete(comment.id); }}
              className="text-fg-subtle hover:text-danger text-sm leading-none px-1 py-0.5 rounded hover:bg-danger/10 transition-colors cursor-pointer border-none bg-transparent"
              title="Delete comment"
            >
              ×
            </button>
          </div>
          <div className="px-3 py-2 text-sm leading-relaxed text-fg whitespace-pre-wrap">
            {comment.content}
          </div>
        </div>
      ))}
    </div>
  )
}
