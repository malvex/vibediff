import { useState, useEffect, useRef } from 'react'

interface CommentDialogProps {
  isOpen: boolean
  file: string
  line: number
  lineEnd: number
  onSubmit: (content: string) => void
  onClose: () => void
}

export default function CommentDialog({ isOpen, file, line, lineEnd, onSubmit, onClose }: CommentDialogProps): React.ReactElement | null {
  const [content, setContent] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isOpen])

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (content.trim()) {
      onSubmit(content.trim())
      setContent('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-surface-overlay" onClick={onClose}>
      <div
        className="bg-surface-raised rounded-lg shadow-xl w-[480px] max-w-[90%]"
        onClick={(e) => { e.stopPropagation(); }}
      >
        <form onSubmit={handleSubmit} className="p-4">
          <h3 className="text-base font-semibold text-fg mb-2">
            Add Comment - {file}:{String(Math.abs(line))}{lineEnd !== line ? `-${String(Math.abs(lineEnd))}` : ''}
          </h3>

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => { setContent(e.target.value); }}
            onKeyDown={handleKeyDown}
            placeholder="Leave a comment"
            className="w-full px-2 py-2 border border-edge rounded-md text-sm
              bg-surface text-fg placeholder-fg-subtle
              focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20
              resize-vertical mb-2"
            style={{ minHeight: '100px', fontFamily: 'inherit' }}
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-[5px] text-sm font-medium bg-surface-inset text-fg
                border border-edge rounded-md
                hover:bg-edge transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!content.trim()}
              className="px-4 py-[5px] text-sm font-medium text-accent-fg
                bg-accent hover:bg-accent-emphasis disabled:opacity-50
                border border-accent rounded-md transition-colors disabled:cursor-not-allowed"
            >
              Comment
            </button>
          </div>

          <p className="text-xs text-fg-muted mt-2">
            Press Enter to submit, Esc to cancel
          </p>
        </form>
      </div>
    </div>
  )
}
