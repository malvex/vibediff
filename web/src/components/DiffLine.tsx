import React, { useMemo } from 'react'
import type { DiffLine as DiffLineType } from '../types/diff'
import { getLanguageFromFilename, highlightCode } from '../utils/prism'

interface DiffLineProps {
  line: DiffLineType
  viewMode: 'unified' | 'split'
  onMouseEnter: () => void
  onMouseLeave: () => void
  onDragStart?: () => void
  isInSelection?: boolean
  isInCommentRange?: boolean
  filename: string
  wrapLines?: boolean
}

// Configuration for line types
const LINE_TYPE_CONFIG = {
  add: { class: 'line-addition', codeClass: 'line-code-addition', prefix: '+' },
  added: { class: 'line-addition', codeClass: 'line-code-addition', prefix: '+' },
  delete: { class: 'line-deletion', codeClass: 'line-code-deletion', prefix: '-' },
  deleted: { class: 'line-deletion', codeClass: 'line-code-deletion', prefix: '-' },
  normal: { class: '', codeClass: '', prefix: ' ' },
  context: { class: '', codeClass: '', prefix: ' ' }
}

// Add Comment Button Component
const AddCommentButton = ({ onDragStart }: { onDragStart?: () => void }): React.ReactElement => (
  <button
    onMouseDown={(e) => {
      e.preventDefault()
      onDragStart?.()
    }}
    className="absolute -left-[26px] top-0 w-[22px] h-5 bg-accent text-accent-fg rounded-[3px] text-base leading-5 cursor-pointer hidden group-hover:block hover:bg-accent-emphasis hover:scale-110 transition-transform p-0"
  >
    +
  </button>
)

const DiffLine = React.memo(({
  line,
  viewMode,
  onMouseEnter,
  onMouseLeave,
  onDragStart,
  isInSelection = false,
  isInCommentRange = false,
  filename,
  wrapLines = false
}: DiffLineProps): React.ReactElement => {
  const config = LINE_TYPE_CONFIG[line.type]
  const isAddition = line.type === 'add' || line.type === 'added'
  const isDeletion = line.type === 'delete' || line.type === 'deleted'

  const highlightedContent = useMemo(() => {
    const language = getLanguageFromFilename(filename)
    if (!line.content) {
      return ''
    }
    return highlightCode(line.content, language)
  }, [line.content, filename])

  if (viewMode === 'unified') {
    return (
      <tr
        className={`group font-mono text-xs leading-5 diff-line ${config.class} ${isInSelection ? 'line-selected' : ''} ${isInCommentRange ? 'line-commented-range' : ''}`}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* Old Line Number */}
        <td className={`line-num w-[50px] min-w-[50px] px-[10px] text-center select-none border-r border-edge ${isDeletion ? 'line-num-deletion' : ''}`}>
          {line.oldLineNumber ?? line.oldNumber ?? ''}
        </td>

        {/* New Line Number */}
        <td className={`line-num w-[50px] min-w-[50px] px-[10px] text-center select-none border-r border-edge ${isAddition ? 'line-num-addition' : ''}`}>
          {line.newLineNumber ?? line.newNumber ?? ''}
        </td>

        {/* Code Line */}
        <td className={`line-code px-[10px] py-0 relative w-full ${wrapLines ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'} ${config.codeClass}`} data-prefix={config.prefix}>
          <code className={`language-${getLanguageFromFilename(filename)}`} dangerouslySetInnerHTML={{ __html: highlightedContent }} />

          <AddCommentButton onDragStart={onDragStart} />
        </td>
      </tr>
    )
  }

  // Split view
  return (
    <>
      {isDeletion || line.type === 'normal' || line.type === 'context' ? (
        <>
          <td className={`line-num w-[50px] min-w-[50px] px-[10px] text-center select-none border-r border-edge ${isDeletion ? 'line-num-deletion' : ''} ${isInSelection ? 'line-selected' : ''} ${isInCommentRange ? 'line-commented-range' : ''}`}>
            {line.oldLineNumber ?? line.oldNumber ?? ''}
          </td>
          <td className={`line-code px-[10px] py-0 relative border-r-2 border-r-edge ${wrapLines ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'} ${config.codeClass} ${isInSelection ? 'line-selected' : ''} ${isInCommentRange ? 'line-commented-range' : ''}`} data-prefix={config.prefix}>
            <code className={`language-${getLanguageFromFilename(filename)}`} dangerouslySetInnerHTML={{ __html: highlightedContent }} />
            <AddCommentButton onDragStart={onDragStart} />
          </td>
        </>
      ) : (
        <>
          <td className={`line-num w-[50px] min-w-[50px] px-[10px] text-center select-none border-r border-edge ${isAddition ? 'line-num-addition' : ''} ${isInSelection ? 'line-selected' : ''} ${isInCommentRange ? 'line-commented-range' : ''}`}>
            {line.newLineNumber ?? line.newNumber ?? ''}
          </td>
          <td className={`line-code px-[10px] py-0 relative ${wrapLines ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'} ${config.codeClass} ${isInSelection ? 'line-selected' : ''} ${isInCommentRange ? 'line-commented-range' : ''}`} data-prefix={config.prefix}>
            <code className={`language-${getLanguageFromFilename(filename)}`} dangerouslySetInnerHTML={{ __html: highlightedContent }} />
            <AddCommentButton onDragStart={onDragStart} />
          </td>
        </>
      )}
    </>
  )
})

export default DiffLine
