import React from 'react'
import type { FileDiff as FileDiffType, ViewMode, DiffLine as DiffLineType, Comment } from '../types/diff'
import DiffLine from './DiffLine'
import CommentDisplay from './CommentDisplay'

interface SplitViewLineResult {
  line: React.ReactNode
  comments: Comment[]
  lineNumber: number
}

interface FileDiffProps {
  file: FileDiffType
  viewMode: ViewMode
  collapsed: boolean
  onToggleCollapse: () => void
  onAddComment: (line: number) => void
  onViewFullFile: () => void
  getCommentsForLine: (file: string, line: number) => Comment[]
  onDeleteComment: (id: string) => Promise<void>
  hideViewFullFile?: boolean
  wrapLines?: boolean
}

export default function FileDiff({
  file,
  viewMode,
  collapsed,
  onToggleCollapse,
  onAddComment,
  onViewFullFile,
  getCommentsForLine,
  onDeleteComment,
  hideViewFullFile = false,
  wrapLines = false
}: FileDiffProps): React.ReactElement {
  return (
    <div id={`file-${file.path.replace(/\//g, '-')}`} className="border border-[#d1d5da] dark:border-[#30363d] rounded-md mb-4">
      {/* File Header */}
      <div
        className="bg-[#f6f8fa] dark:bg-[#161b22] px-4 py-[10px] border-b border-[#d1d5da] dark:border-[#30363d] flex items-center justify-between gap-2 cursor-pointer select-none"
        onClick={onToggleCollapse}
      >
        <div className="flex items-center gap-1 flex-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}>
          <span className="inline-block text-[#586069] dark:text-[#8b949e] text-xs leading-none font-mono">
            {collapsed ? '▶' : '▼'}
          </span>

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
                {file.hunks.map((hunk, hunkIndex) => (
                  <React.Fragment key={hunkIndex}>
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
                            onMouseEnter={() => { /* hover effect */ }}
                            onMouseLeave={() => { /* hover effect */ }}
                            onAddComment={() => { onAddComment(lineNumber); }}
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
                ))}
              </tbody>
            </table>
          ) : (
            <table className="split-diff-table w-full">
              <tbody>
                {file.hunks.map((hunk, hunkIndex) => (
                  <React.Fragment key={hunkIndex}>
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
                            onMouseEnter={() => { /* hover effect */ }}
                            onMouseLeave={() => { /* hover effect */ }}
                            onAddComment={() => { onAddComment(lineNumber); }}
                            filename={file.path}
                            wrapLines={wrapLines}
                          />
                        ),
                        comments,
                        lineNumber
                      }
                    }, onDeleteComment)}
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
