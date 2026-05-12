import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import type { FileDiff as FileDiffType, ViewMode, DiffLine as DiffLineType, DiffType, Comment } from '../types/diff'
import DiffLine from './DiffLine'
import CommentDisplay from './CommentDisplay'
import InlineCommentForm from './InlineCommentForm'
import { useRangeSelection } from '../hooks/useRangeSelection'

interface SplitViewLineResult {
  line: React.ReactNode
  comments: Comment[]
  lineNumber: number
}

const EXPAND_STEP = 10

interface GapInfo {
  key: string
  gapStart: number
  gapEnd: number
  hunkIndex: number
  position: 'before-first' | 'between' | 'after-last'
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
  unknownCount?: boolean
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

  const showExpandDown = gap.position === 'between' || gap.position === 'after-last'
  const showExpandUp = gap.position === 'between' || gap.position === 'before-first'

  return (
    <tr className="bg-surface-raised border-y border-edge">
      <td colSpan={colSpan} className="px-[10px] py-1 text-xs font-mono text-center">
        <span className="inline-flex items-center gap-3">
          {gapData.remainingHidden > 0 && showExpandDown && (
            <button
              onClick={onExpandDown}
              className="text-accent-emphasis hover:underline cursor-pointer bg-transparent border-none"
              disabled={isLoading}
            >
              ↓ Expand down
            </button>
          )}

          {isLoading && (
            <span className="text-fg-muted">Loading...</span>
          )}
          {!isLoading && gapData.remainingHidden > 0 && !gapData.unknownCount && (
            <span className="text-fg-muted">
              {String(gapData.remainingHidden)} lines hidden
            </span>
          )}

          {gapData.remainingHidden > 0 && showExpandUp && (
            <button
              onClick={onExpandUp}
              className="text-accent-emphasis hover:underline cursor-pointer bg-transparent border-none"
              disabled={isLoading}
            >
              ↑ Expand up
            </button>
          )}

          {gapData.isExpanded && (
            <button
              onClick={onCollapse}
              className="text-fg-muted hover:text-fg hover:underline cursor-pointer bg-transparent border-none"
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
  isReviewed?: boolean
  onToggleReviewed?: () => void
  commentCount?: number
  activeComment?: { line: number; lineEnd: number } | null
  onSubmitComment?: (content: string) => void
  onCancelComment?: () => void
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
  selectedRevision = null,
  isReviewed = false,
  onToggleReviewed,
  commentCount = 0,
  activeComment = null,
  onSubmitComment,
  onCancelComment
}: FileDiffProps): React.ReactElement {
  const [fullDiff, setFullDiff] = useState<FileDiffType | null>(null)
  const [isLoadingFull, setIsLoadingFull] = useState(false)
  const [gapExpansions, setGapExpansions] = useState<Record<string, GapExpansion>>({})
  const pendingExpandRef = useRef<{ gapKey: string; direction: 'up' | 'down' } | null>(null)

  useEffect(() => {
    setFullDiff(null)
    setGapExpansions({})
    pendingExpandRef.current = null
  }, [file])

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

  const gapInfos = useMemo((): GapInfo[] => {
    const hunks = file.hunks
    if (hunks.length === 0) return []

    const result: GapInfo[] = []

    const firstStart = hunks[0].newStart
    if (firstStart > 1) {
      result.push({
        key: 'before',
        gapStart: 1,
        gapEnd: firstStart - 1,
        hunkIndex: -1,
        position: 'before-first'
      })
    }

    for (let i = 0; i < hunks.length - 1; i++) {
      const current = hunks[i]
      const next = hunks[i + 1]
      const currentEnd = current.newStart + current.newLines
      if (next.newStart > currentEnd) {
        result.push({
          key: `after-${String(i)}`,
          gapStart: currentEnd,
          gapEnd: next.newStart - 1,
          hunkIndex: i,
          position: 'between'
        })
      }
    }

    const lastHunk = hunks[hunks.length - 1]
    const lastEnd = lastHunk.newStart + lastHunk.newLines
    result.push({
      key: `after-${String(hunks.length - 1)}`,
      gapStart: lastEnd,
      gapEnd: Infinity,
      hunkIndex: hunks.length - 1,
      position: 'after-last'
    })

    return result
  }, [file.hunks])

  const getGapAfterHunk = useCallback((hunkIndex: number): GapInfo | undefined => {
    if (hunkIndex === -1) {
      return gapInfos.find(g => g.key === 'before')
    }
    return gapInfos.find(g => g.key === `after-${String(hunkIndex)}`)
  }, [gapInfos])

  const getGapAfterLastHunk = useCallback((): GapInfo | undefined => {
    return gapInfos.find(g => g.position === 'after-last')
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

  const fullDiffMaxLine = useMemo(() => {
    if (!fullLineMap) return null
    let max = 0
    for (const num of fullLineMap.keys()) {
      if (num > max) max = num
    }
    return max
  }, [fullLineMap])

  const getGapRenderData = useCallback((gap: GapInfo): GapRenderData => {
    const expansion = gapExpansions[gap.key] ?? { down: 0, up: 0 }
    const isExpanded = expansion.down > 0 || expansion.up > 0

    let effectiveGapEnd = gap.gapEnd
    if (gap.position === 'after-last') {
      if (fullDiffMaxLine != null && fullDiffMaxLine >= gap.gapStart) {
        effectiveGapEnd = fullDiffMaxLine
      } else if (!fullLineMap) {
        return { topLines: [], bottomLines: [], remainingHidden: 1, isExpanded, unknownCount: true }
      } else {
        return { topLines: [], bottomLines: [], remainingHidden: 0, isExpanded: false }
      }
    }

    const totalGap = effectiveGapEnd - gap.gapStart + 1

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
    const bottomStart = effectiveGapEnd - effectiveUp + 1
    for (let i = 0; i < effectiveUp; i++) {
      const line = fullLineMap.get(bottomStart + i)
      if (line) bottomLines.push(line)
    }

    const remainingHidden = Math.max(0, totalGap - effectiveDown - effectiveUp)
    return { topLines, bottomLines, remainingHidden, isExpanded }
  }, [gapExpansions, fullLineMap, fullDiffMaxLine])

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

  const noop = useCallback(() => { /* expanded context line */ }, [])

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

  const getGapBeforeHunk = useCallback((hunkIndex: number): GapInfo | undefined => {
    return hunkIndex === 0
      ? getGapAfterHunk(-1)
      : getGapAfterHunk(hunkIndex - 1)
  }, [getGapAfterHunk])

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
    <div id={`file-${file.path.replace(/\//g, '-')}`} className="border border-edge rounded-lg mb-3">
      {/* File Header */}
      <div
        className="bg-surface-raised px-3 py-2 border-b border-edge flex items-center justify-between gap-2 cursor-pointer select-none rounded-t-lg"
        onClick={onToggleCollapse}
      >
        <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}>
          <svg
            className={`w-3 h-3 text-fg-muted transition-transform ${collapsed ? '' : 'rotate-90'}`}
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path d="M6 4l4 4-4 4V4z"/>
          </svg>

          <div className="flex-1 flex items-center gap-2">
            <span className={`text-sm font-semibold font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Helvetica,Arial,sans-serif] ${isReviewed ? 'text-fg-muted' : 'text-fg'}`}>
              {file.path}
            </span>
            {file.isRenamed && file.oldPath && (
              <span className="text-xs text-fg-muted">
                renamed from {file.oldPath}
              </span>
            )}
          </div>

        <div className="flex items-center gap-3">
          {commentCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent/10 text-accent-emphasis">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
              {commentCount}
            </span>
          )}

          <div className="flex items-center gap-2 text-sm">
            <span className="text-success">+{file.additions}</span>
            <span className="text-danger">-{file.deletions}</span>
          </div>

          {onToggleReviewed && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleReviewed(); }}
              className={`px-2 py-[3px] text-xs font-medium border rounded-md transition-colors cursor-pointer ${
                isReviewed
                  ? 'bg-success/15 text-success border-success/30 hover:bg-success/25'
                  : 'bg-surface-inset text-fg-muted border-edge hover:bg-edge hover:text-fg'
              }`}
              title={isReviewed ? 'Unmark as reviewed' : 'Mark as reviewed'}
            >
              {isReviewed ? '✓ Reviewed' : 'Review'}
            </button>
          )}

          {!hideViewFullFile && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewFullFile(); }}
              className="px-3 py-[3px] text-xs font-medium bg-surface-inset text-fg border border-edge rounded-md hover:bg-edge transition-colors cursor-pointer"
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
                    {gapBefore && renderGap(gapBefore, 3, false)}

                    {/* Hunk Header */}
                    <tr>
                      <td colSpan={3} className="px-[10px] py-1 text-xs font-mono text-left bg-diff-hunk text-diff-hunk-fg">
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
                          {activeComment && lineNumber === activeComment.lineEnd && onSubmitComment && onCancelComment && (
                            <InlineCommentForm
                              line={activeComment.line}
                              lineEnd={activeComment.lineEnd}
                              onSubmit={onSubmitComment}
                              onCancel={onCancelComment}
                              colSpan={3}
                            />
                          )}
                        </React.Fragment>
                      )
                    })}
                  </React.Fragment>
                  )
                })}
                {(() => {
                  const gapAfterLast = getGapAfterLastHunk()
                  return gapAfterLast ? renderGap(gapAfterLast, 3, false) : null
                })()}
              </tbody>
            </table>
          ) : (
            <table className="split-diff-table w-full">
              <tbody>
                {file.hunks.map((hunk, hunkIndex) => {
                  const gapBefore = getGapBeforeHunk(hunkIndex)
                  return (
                  <React.Fragment key={hunkIndex}>
                    {gapBefore && renderGap(gapBefore, 4, true)}

                    {/* Hunk Header */}
                    <tr>
                      <td colSpan={4} className="px-[10px] py-1 text-xs font-mono text-left bg-diff-hunk text-diff-hunk-fg">
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
                    }, onDeleteComment, activeComment && onSubmitComment && onCancelComment ? { activeComment, onSubmitComment, onCancelComment } : null)}
                  </React.Fragment>
                  )
                })}
                {(() => {
                  const gapAfterLast = getGapAfterLastHunk()
                  return gapAfterLast ? renderGap(gapAfterLast, 4, true) : null
                })()}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

interface InlineCommentInfo {
  activeComment: { line: number; lineEnd: number }
  onSubmitComment: (content: string) => void
  onCancelComment: () => void
}

function renderSplitView(lines: DiffLineType[], renderLine: (line: DiffLineType, index: number) => SplitViewLineResult, onDeleteComment: (id: string) => Promise<void>, inlineComment: InlineCommentInfo | null): React.ReactNode[] {
  const rows: React.ReactNode[] = []
  let i = 0

  const maybeRenderInlineForm = (lineNumber: number, key: string): void => {
    if (inlineComment && lineNumber === inlineComment.activeComment.lineEnd) {
      rows.push(
        <InlineCommentForm
          key={`${key}-inline-form`}
          line={inlineComment.activeComment.line}
          lineEnd={inlineComment.activeComment.lineEnd}
          onSubmit={inlineComment.onSubmitComment}
          onCancel={inlineComment.onCancelComment}
          colSpan={4}
        />
      )
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    if (line.type === 'normal' || line.type === 'context') {
      const result = renderLine(line, i)
      rows.push(
        <tr key={i} className="group">
          {result.line}
          {result.line}
        </tr>
      )
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
      maybeRenderInlineForm(result.lineNumber, String(i))
      i++
    } else if (line.type === 'delete' || line.type === 'deleted') {
      const nextLine = i + 1 < lines.length ? lines[i + 1] : undefined
      if (nextLine?.type === 'add' || nextLine?.type === 'added') {
        const deleteResult = renderLine(line, i)
        const addResult = renderLine(nextLine, i + 1)
        rows.push(
          <tr key={i} className="group">
            {deleteResult.line}
            {addResult.line}
          </tr>
        )
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
        maybeRenderInlineForm(deleteResult.lineNumber, String(i))
        maybeRenderInlineForm(addResult.lineNumber, `${String(i)}-add`)
        i += 2
      } else {
        const result = renderLine(line, i)
        rows.push(
          <tr key={i} className="group">
            {result.line}
            <td colSpan={2} className="bg-surface-raised"></td>
          </tr>
        )
        if (result.comments.length > 0) {
          rows.push(
            <tr key={`${String(i)}-comment`}>
              <td colSpan={2} className="p-0">
                <CommentDisplay
                  comments={result.comments}
                  onDelete={(id) => { void onDeleteComment(id); }}
                />
              </td>
              <td colSpan={2} className="bg-surface-raised"></td>
            </tr>
          )
        }
        maybeRenderInlineForm(result.lineNumber, String(i))
        i++
      }
    } else {
      const result = renderLine(line, i)
      rows.push(
        <tr key={i} className="group">
          <td colSpan={2} className="bg-surface-raised"></td>
          {result.line}
        </tr>
      )
      if (result.comments.length > 0) {
        rows.push(
          <tr key={`${String(i)}-comment`}>
            <td colSpan={2} className="bg-surface-raised"></td>
            <td colSpan={2} className="p-0">
              <CommentDisplay
                comments={result.comments}
                onDelete={(id) => { void onDeleteComment(id); }}
              />
            </td>
          </tr>
        )
      }
      maybeRenderInlineForm(result.lineNumber, String(i))
      i++
    }
  }

  return rows
}
