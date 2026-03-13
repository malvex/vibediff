import React, { useMemo, useCallback, useState, useEffect } from 'react'
import type { FileDiff as FileDiffType, ViewMode, DiffLine as DiffLineType, DiffType, Comment, Hunk } from '../types/diff'
import DiffLine from './DiffLine'
import CommentDisplay from './CommentDisplay'
import { useRangeSelection } from '../hooks/useRangeSelection'

interface SplitViewLineResult {
  line: React.ReactNode
  comments: Comment[]
  lineNumber: number
}

interface ExpandRowProps {
  onClick: () => void
  lines: number
  colSpan: number
  isLoading: boolean
}

function ExpandRow({ onClick, lines, colSpan, isLoading }: ExpandRowProps): React.ReactElement {
  return (
    <tr
      className="cursor-pointer hover:bg-[#ddf4ff] dark:hover:bg-[#1a3a5c] transition-colors"
      onClick={onClick}
    >
      <td
        colSpan={colSpan}
        className="px-[10px] py-1 text-xs font-mono text-center text-[#0969da] dark:text-[#58a6ff] bg-[#f6f8fa] dark:bg-[#161b22] border-y border-[#d0d7de] dark:border-[#30363d]"
      >
        {isLoading ? 'Loading...' : `↕ Expand ${String(lines)} hidden lines`}
      </td>
    </tr>
  )
}

interface FileDiffProps {
  file: FileDiffType
  viewMode: ViewMode
  collapsed: boolean
  onToggleCollapse: () => void
  onAddComment: (line: number, lineEnd: number) => void
  onViewFullFile: () => void
  getCommentsForLine: (file: string, line: number) => Comment[]
  getCommentRangeLines?: (file: string, lineOrder: number[]) => Set<number>
  onDeleteComment: (id: string) => Promise<void>
  hideViewFullFile?: boolean
  wrapLines?: boolean
  diffType?: DiffType
  selectedRevision?: string | null
}

export default function FileDiff({
  file,
  viewMode,
  collapsed,
  onToggleCollapse,
  onAddComment,
  onViewFullFile,
  getCommentsForLine,
  getCommentRangeLines,
  onDeleteComment,
  hideViewFullFile = false,
  wrapLines = false,
  diffType = 'all',
  selectedRevision = null
}: FileDiffProps): React.ReactElement {
  const [expandedHunks, setExpandedHunks] = useState<Hunk[] | null>(null)
  const [isExpanding, setIsExpanding] = useState(false)

  // Reset expanded state when the file changes (e.g. after refetch)
  useEffect(() => {
    setExpandedHunks(null)
  }, [file])

  const displayHunks = expandedHunks ?? file.hunks

  const handleExpand = useCallback(async () => {
    if (isExpanding || expandedHunks) return
    setIsExpanding(true)
    try {
      const params = new URLSearchParams()
      if (selectedRevision) {
        params.set('revision', selectedRevision)
      } else {
        params.set('type', diffType)
      }
      const encodedPath = encodeURIComponent(file.path)
      const response = await fetch(`/api/diff/${encodedPath}/full?${params.toString()}`)
      if (response.ok) {
        const fullDiff = await response.json() as FileDiffType
        setExpandedHunks(fullDiff.hunks)
      }
    } catch (err) {
      console.error('Failed to expand context:', err)
    } finally {
      setIsExpanding(false)
    }
  }, [isExpanding, expandedHunks, selectedRevision, diffType, file.path])

  // Compute gaps between hunks for expand buttons
  const gaps = useMemo(() => {
    const result: { before: number; between: { index: number; lines: number }[] } = {
      before: 0,
      between: []
    }
    if (expandedHunks) return result // No gaps when expanded

    const hunks = file.hunks
    if (hunks.length === 0) return result

    // Gap before first hunk
    const firstStart = Math.max(hunks[0].newStart, hunks[0].oldStart)
    if (firstStart > 1) {
      result.before = firstStart - 1
    }

    // Gaps between hunks
    for (let i = 0; i < hunks.length - 1; i++) {
      const current = hunks[i]
      const next = hunks[i + 1]
      const currentEnd = current.newStart + current.newLines
      const gap = next.newStart - currentEnd
      if (gap > 0) {
        result.between.push({ index: i, lines: gap })
      }
    }

    return result
  }, [file.hunks, expandedHunks])

  const lineOrder = useMemo(() =>
    displayHunks.flatMap(hunk =>
      hunk.lines.map(line => {
        const isDel = line.type === 'delete' || line.type === 'deleted'
        return isDel
          ? -(line.oldLineNumber ?? line.oldNumber ?? 0)
          : (line.newLineNumber ?? line.newNumber ?? 0)
      })
    ), [displayHunks])

  const commentRangeLines = useMemo(() =>
    getCommentRangeLines ? getCommentRangeLines(file.path, lineOrder) : new Set<number>()
  , [getCommentRangeLines, file.path, lineOrder])

  const handleSelect = useCallback((line: number, lineEnd: number) => {
    onAddComment(line, lineEnd)
  }, [onAddComment])

  const { handleDragStart, handleDragEnter, selectedLines } = useRangeSelection({
    lineOrder,
    onSelect: handleSelect
  })

  return (
    <div id={`file-${file.path.replace(/\//g, '-')}`} className="border border-[#d1d5da] dark:border-[#30363d] rounded-md mb-3">
      {/* File Header */}
      <div
        className="bg-[#f6f8fa] dark:bg-[#161b22] px-3 py-2 border-b border-[#d1d5da] dark:border-[#30363d] flex items-center justify-between gap-2 cursor-pointer select-none"
        onClick={onToggleCollapse}
      >
        <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}>
          <svg
            className={`w-3 h-3 text-[#57606a] dark:text-[#8b949e] transition-transform ${collapsed ? '' : 'rotate-90'}`}
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path d="M6 4l4 4-4 4V4z"/>
          </svg>

          <div className="flex-1">
            <span className="text-sm font-semibold text-[#24292e] dark:text-[#c9d1d9] font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Helvetica,Arial,sans-serif]">
              {file.path}
            </span>
            {file.isRenamed && file.oldPath && (
              <span className="text-xs text-gray-500 dark:text-gray-400 block">
                renamed from {file.oldPath}
              </span>
            )}
          </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[#28a745] dark:text-[#2ea043]">+{file.additions}</span>
            <span className="text-[#d73a49] dark:text-[#f85149]">-{file.deletions}</span>
          </div>

          {!hideViewFullFile && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewFullFile(); }}
              className="px-3 py-[3px] text-xs font-medium bg-[#fafbfc] dark:bg-[#21262d] text-[#24292e] dark:text-[#c9d1d9] border border-[rgba(27,31,35,.15)] dark:border-[#30363d] rounded-md hover:bg-[#f3f4f6] dark:hover:bg-[#30363d] transition-colors cursor-pointer"
            >
              View full file
            </button>
          )}
        </div>
        </div>
      </div>

      {/* Diff Content */}
      {!collapsed && (
        <div className="overflow-x-auto">
          {viewMode === 'unified' ? (
            <table className="diff-table w-full">
              <tbody>
                {displayHunks.map((hunk, hunkIndex) => (
                  <React.Fragment key={hunkIndex}>
                    {/* Expand row before first hunk */}
                    {hunkIndex === 0 && gaps.before > 0 && (
                      <ExpandRow onClick={() => { void handleExpand() }} lines={gaps.before} colSpan={3} isLoading={isExpanding} />
                    )}

                    {/* Hunk Header */}
                    <tr>
                      <td colSpan={3} className="px-[10px] py-1 text-xs font-mono text-left" style={{ backgroundColor: 'var(--color-hunk-bg)', color: 'var(--color-hunk-text)' }}>
                        {hunk.header}
                      </td>
                    </tr>

                    {/* Diff Lines */}
                    {hunk.lines.map((line, lineIndex) => {
                      const lineNumber = (line.type === 'delete' || line.type === 'deleted')
                        ? -(line.oldLineNumber ?? line.oldNumber ?? 0)
                        : (line.newLineNumber ?? line.newNumber ?? 0)
                      const comments = getCommentsForLine(file.path, lineNumber)

                      return (
                        <React.Fragment key={`${String(hunkIndex)}-${String(lineIndex)}`}>
                          <DiffLine
                            line={line}
                            viewMode="unified"
                            onMouseEnter={() => { handleDragEnter(lineNumber); }}
                            onMouseLeave={() => { /* hover effect */ }}
                            onDragStart={() => { handleDragStart(lineNumber); }}
                            isInSelection={selectedLines.has(lineNumber)}
                            isInCommentRange={commentRangeLines.has(lineNumber)}
                            filename={file.path}
                            wrapLines={wrapLines}
                          />
                          {comments.length > 0 && (
                            <tr>
                              <td colSpan={3} className="p-0">
                                <CommentDisplay
                                  comments={comments}
                                  onDelete={(id) => { void onDeleteComment(id); }}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}

                    {/* Expand row between hunks */}
                    {(() => {
                      const gap = gaps.between.find(g => g.index === hunkIndex)
                      return gap ? <ExpandRow onClick={() => { void handleExpand() }} lines={gap.lines} colSpan={3} isLoading={isExpanding} /> : null
                    })()}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="split-diff-table w-full">
              <tbody>
                {displayHunks.map((hunk, hunkIndex) => (
                  <React.Fragment key={hunkIndex}>
                    {/* Expand row before first hunk */}
                    {hunkIndex === 0 && gaps.before > 0 && (
                      <ExpandRow onClick={() => { void handleExpand() }} lines={gaps.before} colSpan={4} isLoading={isExpanding} />
                    )}

                    {/* Hunk Header */}
                    <tr>
                      <td colSpan={4} className="px-[10px] py-1 text-xs font-mono text-left" style={{ backgroundColor: 'var(--color-hunk-bg)', color: 'var(--color-hunk-text)' }}>
                        {hunk.header}
                      </td>
                    </tr>

                    {/* Split View Lines */}
                    {renderSplitView(hunk.lines, (line, index) => {
                      const lineNumber = (line.type === 'delete' || line.type === 'deleted')
                        ? -(line.oldLineNumber ?? line.oldNumber ?? 0)
                        : (line.newLineNumber ?? line.newNumber ?? 0)
                      const comments = getCommentsForLine(file.path, lineNumber)

                      return {
                        line: (
                          <DiffLine
                            key={`${String(hunkIndex)}-${String(index)}`}
                            line={line}
                            viewMode="split"
                            onMouseEnter={() => { handleDragEnter(lineNumber); }}
                            onMouseLeave={() => { /* hover effect */ }}
                            onDragStart={() => { handleDragStart(lineNumber); }}
                            isInSelection={selectedLines.has(lineNumber)}
                            isInCommentRange={commentRangeLines.has(lineNumber)}
                            filename={file.path}
                            wrapLines={wrapLines}
                          />
                        ),
                        comments,
                        lineNumber
                      }
                    }, onDeleteComment)}

                    {/* Expand row between hunks */}
                    {(() => {
                      const gap = gaps.between.find(g => g.index === hunkIndex)
                      return gap ? <ExpandRow onClick={() => { void handleExpand() }} lines={gap.lines} colSpan={4} isLoading={isExpanding} /> : null
                    })()}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

function renderSplitView(lines: DiffLineType[], renderLine: (line: DiffLineType, index: number) => SplitViewLineResult, onDeleteComment: (id: string) => Promise<void>): React.ReactNode[] {
  const rows: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.type === 'normal' || line.type === 'context') {
      // Context line appears on both sides
      const result = renderLine(line, i)
      rows.push(
        <tr key={i} className="group">
          {result.line}
          {result.line}
        </tr>
      )
      // Add comment row if there are comments
      if (result.comments.length > 0) {
        rows.push(
          <tr key={`${String(i)}-comment`}>
            <td colSpan={4} className="p-0">
              <CommentDisplay
                comments={result.comments}
                onDelete={(id) => { void onDeleteComment(id); }}
              />
            </td>
          </tr>
        )
      }
      i++
    } else if (line.type === 'delete' || line.type === 'deleted') {
      // Check if next line is an add (change)
      const nextLine = i + 1 < lines.length ? lines[i + 1] : undefined
      if (nextLine?.type === 'add' || nextLine?.type === 'added') {
        // Changed line
        const deleteResult = renderLine(line, i)
        const addResult = renderLine(nextLine, i + 1)
        rows.push(
          <tr key={i} className="group">
            {deleteResult.line}
            {addResult.line}
          </tr>
        )
        // Add comment rows for both sides if needed
        if (deleteResult.comments.length > 0 || addResult.comments.length > 0) {
          rows.push(
            <tr key={`${String(i)}-comment`}>
              <td colSpan={2} className="p-0">
                {deleteResult.comments.length > 0 && (
                  <CommentDisplay
                    comments={deleteResult.comments}
                    onDelete={(id) => { void onDeleteComment(id); }}
                  />
                )}
              </td>
              <td colSpan={2} className="p-0">
                {addResult.comments.length > 0 && (
                  <CommentDisplay
                    comments={addResult.comments}
                    onDelete={(id) => { void onDeleteComment(id); }}
                  />
                )}
              </td>
            </tr>
          )
        }
        i += 2
      } else {
        // Deleted line only
        const result = renderLine(line, i)
        rows.push(
          <tr key={i} className="group">
            {result.line}
            <td colSpan={2} className="bg-gray-50 dark:bg-gray-900/50"></td>
          </tr>
        )
        // Add comment row if there are comments
        if (result.comments.length > 0) {
          rows.push(
            <tr key={`${String(i)}-comment`}>
              <td colSpan={2} className="p-0">
                <CommentDisplay
                  comments={result.comments}
                  onDelete={(id) => { void onDeleteComment(id); }}
                />
              </td>
              <td colSpan={2} className="bg-gray-50 dark:bg-gray-900/50"></td>
            </tr>
          )
        }
        i++
      }
    } else {
      // Added line only (not part of a change)
      const result = renderLine(line, i)
      rows.push(
        <tr key={i} className="group">
          <td colSpan={2} className="bg-gray-50 dark:bg-gray-900/50"></td>
          {result.line}
        </tr>
      )
      // Add comment row if there are comments
      if (result.comments.length > 0) {
        rows.push(
          <tr key={`${String(i)}-comment`}>
            <td colSpan={2} className="bg-gray-50 dark:bg-gray-900/50"></td>
            <td colSpan={2} className="p-0">
              <CommentDisplay
                comments={result.comments}
                onDelete={(id) => { void onDeleteComment(id); }}
              />
            </td>
          </tr>
        )
      }
      i++
    }
  }

  return rows
}
