import type { Comment } from '../types/diff'

interface CommentDisplayProps {
  comments: Comment[]
  onDelete: (id: string) => void
}

export default function CommentDisplay({ comments, onDelete }: CommentDisplayProps): React.ReactElement | null {
  if (comments.length === 0) return null

  return (
    <div className="px-6 py-2 bg-[#f6f8fa] dark:bg-[#161b22] border-t border-b border-[#dfe2e5] dark:border-[#30363d]">
      {comments.map(comment => (
        <div key={comment.id} data-comment-id={comment.id} className="bg-white dark:bg-[#0d1117] border border-[#d1d5da] dark:border-[#30363d] rounded-md p-2 my-1 relative">
          <div className="flex justify-between items-start mb-1">
            <div className="text-xs text-[#586069] dark:text-[#8b949e]">
              {new Date(comment.createdAt).toLocaleString()}
            </div>
            <button
              onClick={() => { onDelete(comment.id); }}
              className="text-[rgba(27,31,35,.3)] dark:text-[rgba(139,148,158,.4)] hover:text-[#d73a49] dark:hover:text-[#f85149] text-xl leading-none p-0 w-5 h-5 flex items-center justify-center cursor-pointer border-none bg-transparent"
              title="Delete comment"
            >
              ×
            </button>
          </div>
          <div className="text-sm leading-[1.5] font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Helvetica,Arial,sans-serif]">
            {comment.content}
          </div>
        </div>
      ))}
    </div>
  )
}
