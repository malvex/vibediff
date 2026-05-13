import { useEffect, useState, useCallback } from 'react'
import type { DiffType, FileDiff, Comment } from '../types/diff'
import FileDiffComponent from './FileDiff'
import CommentDialog from './CommentDialog'

interface FullFileModalProps {
  isOpen: boolean
  filePath: string
  onClose: () => void
  viewMode: 'unified' | 'split'
  getCommentsForLine: (file: string, line: number) => Comment[]
  getCommentRangeLines?: (file: string, lineOrder: number[]) => Set<number>
  onDeleteComment: (id: string) => Promise<void>
  onResolveComment?: (id: string) => Promise<void>
  onReopenComment?: (id: string) => Promise<void>
  onAddComment: (file: string, line: number, content: string, lineEnd: number) => void
  wrapLines?: boolean
  diffType?: DiffType
  selectedRevision?: string | null
}

export default function FullFileModal({ isOpen, filePath, onClose, viewMode, getCommentsForLine, getCommentRangeLines, onDeleteComment, onResolveComment, onReopenComment, onAddComment, wrapLines = false, diffType = 'all', selectedRevision }: FullFileModalProps): React.ReactElement | null {
  const [fileData, setFileData] = useState<FileDiff | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [commentDialog, setCommentDialog] = useState<{ line: number; lineEnd: number } | null>(null)

  const fetchFileContent = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (selectedRevision) {
        params.set('revision', selectedRevision)
      } else {
        params.set('type', diffType)
      }
      const response = await fetch(`/api/diff/${encodeURIComponent(filePath)}/full?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Failed to fetch full file diff')
      }
      const data = await response.json() as FileDiff
      setFileData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [filePath, diffType, selectedRevision])

  useEffect(() => {
    if (isOpen && filePath) {
      void fetchFileContent()
    }
  }, [isOpen, filePath, fetchFileContent])

  const handleKeyDown = useCallback((e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      onClose()
    }
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-surface-overlay p-8" onClick={onClose}>
      <div
        className={`bg-surface rounded-lg shadow-2xl w-[90%] h-[90%] flex flex-col ${viewMode === 'split' ? 'max-w-[95%] w-[95%]' : 'max-w-[1200px]'}`}
        onClick={(e) => { e.stopPropagation(); }}
      >
        {/* Header */}
        <div className="px-4 py-4 border-b border-edge flex items-center justify-between">
          <h3 className="text-base font-semibold text-fg">
            Full file: {filePath}
          </h3>
          <button
            onClick={onClose}
            className="px-3 py-[3px] text-xs font-medium bg-surface-inset text-fg
              border border-edge rounded-md
              hover:bg-edge transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4" style={{ overscrollBehavior: 'contain' }}>
          {(() => {
            if (loading) {
              return (
                <div className="flex justify-center items-center h-full">
                  <div className="text-fg-muted">Loading full file...</div>
                </div>
              )
            }
            if (error) {
              return (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-red-600 dark:text-red-400">Error: {error}</p>
                </div>
              )
            }
            if (!fileData) {
              return (
                <div className="flex justify-center items-center h-full">
                  <div className="text-fg-muted">No diff data available</div>
                </div>
              )
            }
            return (
              <div className="p-4">
                <FileDiffComponent
                  file={fileData}
                  viewMode={viewMode}
                  collapsed={false}
                  onToggleCollapse={() => { /* Not collapsible in modal */ }}
                  onAddComment={(line, lineEnd) => {
                    setCommentDialog({ line, lineEnd })
                  }}
                  onViewFullFile={() => { /* Already in full view */ }}
                  getCommentsForLine={getCommentsForLine}
                  getCommentRangeLines={getCommentRangeLines}
                  onDeleteComment={onDeleteComment}
                  onResolveComment={onResolveComment}
                  onReopenComment={onReopenComment}
                  hideViewFullFile={true}
                  wrapLines={wrapLines}
                />
              </div>
            )
          })()}
        </div>
      </div>

      {/* Comment Dialog */}
      <CommentDialog
        isOpen={!!commentDialog}
        file={filePath}
        line={commentDialog?.line ?? 0}
        lineEnd={commentDialog?.lineEnd ?? 0}
        onSubmit={(content) => {
          if (commentDialog) {
            onAddComment(filePath, commentDialog.line, content, commentDialog.lineEnd)
            setCommentDialog(null)
          }
        }}
        onClose={() => { setCommentDialog(null); }}
      />
    </div>
  )
}
