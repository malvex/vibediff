import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import type { FileDiff as FileDiffType, ViewMode, DiffLine as DiffLineType, DiffType, Comment } from '../types/diff'
import DiffLine from './DiffLine'
import CommentDisplay from './CommentDisplay'
import { useRangeSelection } from '../hooks/useRangeSelection'

interface SplitViewLineResult {
  line: React.ReactNode
  comments: Comment[]
  lineNumber: number
}

const EXPAND_STEP = 10

interface GapInfo {
  key: string
  gapStart: number // first hidden new line number
  gapEnd: number   // last hidden new line number
  hunkIndex: number // hunk index this gap appears after (-1 for before first hunk)
}

interface GapExpansion {
  down: number
  up: number
}

interface GapRenderData {
  topLines: DiffLineType[]
  bottomLines: DiffLineType[]
  remainingHidden: number
  isExpanded: boolean
}

function GapRow({ gap, gapData, isLoading, onExpandDown, onExpandUp, onCollapse, colSpan }: {
  gap: GapInfo
  gapData: GapRenderData
  isLoading: boolean
  onExpandDown: () => void
  onExpandUp: () => void
  onCollapse: () => void
  colSpan: number
}): React.ReactElement | null {
  if (gapData.remainingHidden <= 0 && !gapData.isExpanded) return null

  return (
    <tr className="bg-[#f6f8fa] dark:bg-[#161b22] border-y border-[#d0d7de] dark:border-[#30363d]">
      <td colSpan={colSpan} className="px-[10px] py-1 text-xs font-mono text-center">
        <span className="inline-flex items-center gap-3">
          {gapData.remainingHidden > 0 && (
            <button
              onClick={onExpandDown}
              className="text-[#0969da] dark:text-[#58a6ff] hover:underline cursor-pointer bg-transparent border-none"
              disabled={isLoading}
            >
              ↓ Expand down
            </button>
          )}

          {isLoading && (
            <span className="text-[#57606a] dark:text-[#8b949e]">Loading...</span>
          )}
          {!isLoading && gapData.remainingHidden > 0 && (
            <span className="text-[#57606a] dark:text-[#8b949e]">
              {String(gapData.remainingHidden)} lines hidden
            </span>
          )}

          {gapData.remainingHidden > 0 && gap.hunkIndex >= 0 && (
            <button
              onClick={onExpandUp}
              className="text-[#0969da] dark:text-[#58a6ff] hover:underline cursor-pointer bg-transparent border-none"
              disabled={isLoading}
            >
              ↑ Expand up
            </button>
          )}

          {gapData.isExpanded && (
            <button
              onClick={onCollapse}
              className="text-[#57606a] dark:text-[#8b949e] hover:text-[#24292e] dark:hover:text-[#c9d1d9] hover:underline cursor-pointer bg-transparent border-none"
            >
              Collapse
            </button>
          )}
        </span>
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
  const [fullDiff, setFullDiff] = useState<FileDiffType | null>(null)
  const [isLoadingFull, setIsLoadingFull] = useState(false)
  const [gapExpansions, setGapExpansions] = useState<Record<string, GapExpansion>>({})
  const pendingExpandRef = useRef<{ gapKey: string; direction: 'up' | 'down' } | null>(null)

  // Reset state when the file changes
  useEffect(() => {
    setFullDiff(null)
    setGapExpansions({})
    pendingExpandRef.current = null
  }, [file])

  // Build line map from full diff (keyed by new line number)
  const fullLineMap = useMemo(() => {
    if (!fullDiff) return null
    const map = new Map<number, DiffLineType>()
    for (const hunk of fullDiff.hunks) {
      for (const line of hunk.lines) {
        const num = line.newNumber ?? line.newLineNumber
        if (num != null) {
          map.set(num, line)
        }
      }
    }
    return map
  }, [fullDiff])

  // Compute gap info from original hunks
  const gapInfos = useMemo((): GapInfo[] => {
    const hunks = file.hunks
    if (hunks.length === 0) return []

    const result: GapInfo[] = []

    // Gap before first hunk
    const firstStart = hunks[0].newStart
    if (firstStart > 1) {
      result.push({
        key: 'before',
        gapStart: 1,
        gapEnd: firstStart - 1,
        hunkIndex: -1
      })
    }

    // Gaps between hunks
    for (let i = 0; i < hunks.length - 1; i++) {
      const current = hunks[i]
      const next = hunks[i + 1]
      const currentEnd = current.newStart + current.newLines
      if (next.newStart > currentEnd) {
        result.push({
          key: `after-${String(i)}`,
          gapStart: currentEnd,
          gapEnd: next.newStart - 1,
          hunkIndex: i
        })
      }
    }

    return result
  }, [file.hunks])

  // Find gap that appears after a given hunk index (-1 = before first hunk)
  const getGapAfterHunk = useCallback((hunkIndex: number): GapInfo | undefined => {
    if (hunkIndex === -1) {
      return gapInfos.find(g => g.key === 'before')
    }
    return gapInfos.find(g => g.key === `after-${String(hunkIndex)}`)
  }, [gapInfos])

  const fetchFullDiff = useCallback(async (): Promise<void> => {
    if (isLoadingFull || fullDiff) return
    setIsLoadingFull(true)
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
        const data = await response.json() as FileDiffType
        setFullDiff(data)
      }
    } catch (err) {
      console.error('Failed to fetch full diff:', err)
    } finally {
      setIsLoadingFull(false)
    }
  }, [isLoadingFull, fullDiff, selectedRevision, diffType, file.path])

  const applyExpansion = useCallback((gapKey: string, direction: 'up' | 'down') => {
    setGapExpansions(prev => {
      const current = prev[gapKey] ?? { down: 0, up: 0 }
      return {
        ...prev,
        [gapKey]: {
          ...current,
          [direction]: (direction === 'down' ? current.down : current.up) + EXPAND_STEP
        }
      }
    })
  }, [])

  // Apply pending expansion once full diff is loaded
  useEffect(() => {
    if (fullDiff && pendingExpandRef.current) {
      const { gapKey, direction } = pendingExpandRef.current
      pendingExpandRef.current = null
      applyExpansion(gapKey, direction)
    }
  }, [fullDiff, applyExpansion])

  const handleExpand = useCallback((gapKey: string, direction: 'up' | 'down') => {
    if (fullDiff) {
      applyExpansion(gapKey, direction)
    } else {
      pendingExpandRef.current = { gapKey, direction }
      void fetchFullDiff()
    }
  }, [fullDiff, applyExpansion, fetchFullDiff])

  const handleCollapse = useCallback((gapKey: string) => {
    setGapExpansions(prev => {
      const next = { ...prev }
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete next[gapKey]
      return next
    })
  }, [])

  // Get render data for a gap
  const getGapRenderData = useCallback((gap: GapInfo): GapRenderData => {
    const expansion = gapExpansions[gap.key] ?? { down: 0, up: 0 }
    const isExpanded = expansion.down > 0 || expansion.up > 0
    const totalGap = gap.gapEnd - gap.gapStart + 1

    if (!fullLineMap || !isExpanded) {
      return { topLines: [], bottomLines: [], remainingHidden: totalGap, isExpanded }
    }

    const effectiveDown = Math.min(expansion.down, totalGap)
    const effectiveUp = Math.min(expansion.up, Math.max(0, totalGap - effectiveDown))

    const topLines: DiffLineType[] = []
    for (let i = 0; i < effectiveDown; i++) {
      const line = fullLineMap.get(gap.gapStart + i)
      if (line) topLines.push(line)
    }

    const bottomLines: DiffLineType[] = []
    const bottomStart = gap.gapEnd - effectiveUp + 1
    for (let i = 0; i < effectiveUp; i++) {
      const line = fullLineMap.get(bottomStart + i)
      if (line) bottomLines.push(line)
    }

    const remainingHidden = Math.max(0, totalGap - effectiveDown - effectiveUp)
    return { topLines, bottomLines, remainingHidden, isExpanded }
  }, [gapExpansions, fullLineMap])

  const lineOrder = useMemo(() =>
    file.hunks.flatMap(hunk =>
      hunk.lines.map(line => {
        const isDel = line.type === 'delete' || line.type === 'deleted'
        return isDel
          ? -(line.oldLineNumber ?? line.oldNumber ?? 0)
          : (line.newLineNumber ?? line.newNumber ?? 0)
      })
    ), [file.hunks])

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

  // no-op handler for expanded context lines (not interactive)
  const noop = useCallback(() => { /* expanded context line */ }, [])

  // Render expanded context lines for unified view
  const renderExpandedLinesUnified = useCallback((lines: DiffLineType[], keyPrefix: string): React.ReactNode[] => {
    return lines.map((line, i) => (
      <DiffLine
        key={`${keyPrefix}-${String(i)}`}
        line={line}
        viewMode="unified"
        onMouseEnter={noop}
        onMouseLeave={noop}
        filename={file.path}
        wrapLines={wrapLines}
      />
    ))
  }, [file.path, wrapLines, noop])

  // Render expanded context lines for split view
  const renderExpandedLinesSplit = useCallback((lines: DiffLineType[], keyPrefix: string): React.ReactNode[] => {
    return lines.map((line, i) => (
      <tr key={`${keyPrefix}-${String(i)}`} className="group">
        <DiffLine
          line={line}
          viewMode="split"
          onMouseEnter={noop}
          onMouseLeave={noop}
          filename={file.path}
          wrapLines={wrapLines}
        />
        <DiffLine
          line={line}
          viewMode="split"
          onMouseEnter={noop}
          onMouseLeave={noop}
          filename={file.path}
          wrapLines={wrapLines}
        />
      </tr>
    ))
  }, [file.path, wrapLines, noop])

  // Get gap that should appear before a given hunk
  const getGapBeforeHunk = useCallback((hunkIndex: number): GapInfo | undefined => {
    return hunkIndex === 0
      ? getGapAfterHunk(-1)
      : getGapAfterHunk(hunkIndex - 1)
  }, [getGapAfterHunk])

  // Render a gap section (expanded lines + buttons)
  const renderGap = useCallback((gap: GapInfo, colSpan: number, isSplit: boolean): React.ReactNode => {
    const gapData = getGapRenderData(gap)
    const renderLines = isSplit ? renderExpandedLinesSplit : renderExpandedLinesUnified

    return (
      <React.Fragment key={`gap-${gap.key}`}>
        {gapData.topLines.length > 0 && renderLines(gapData.topLines, `gap-${gap.key}-top`)}
        <GapRow
          gap={gap}
          gapData={gapData}
          isLoading={isLoadingFull}
          onExpandDown={() => { handleExpand(gap.key, 'down') }}
          onExpandUp={() => { handleExpand(gap.key, 'up') }}
          onCollapse={() => { handleCollapse(gap.key) }}
          colSpan={colSpan}
        />
        {gapData.bottomLines.length > 0 && renderLines(gapData.bottomLines, `gap-${gap.key}-bottom`)}
      </React.Fragment>
    )
  }, [getGapRenderData, renderExpandedLinesUnified, renderExpandedLinesSplit, isLoadingFull, handleExpand, handleCollapse])

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
                {file.hunks.map((hunk, hunkIndex) => {
                  const gapBefore = getGapBeforeHunk(hunkIndex)
                  return (
                  <React.Fragment key={hunkIndex}>
                    {/* Gap before this hunk */}
                    {gapBefore && renderGap(gapBefore, 3, false)}

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
                  </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <table className="split-diff-table w-full">
              <tbody>
                {file.hunks.map((hunk, hunkIndex) => {
                  const gapBefore = getGapBeforeHunk(hunkIndex)
                  return (
                  <React.Fragment key={hunkIndex}>
                    {/* Gap before this hunk */}
                    {gapBefore && renderGap(gapBefore, 4, true)}

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
                  </React.Fragment>
                  )
                })}
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
