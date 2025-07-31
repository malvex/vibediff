import { useMemo } from 'react'
import type { DiffLine as DiffLineType } from '../types/diff'
import { getLanguageFromFilename, highlightCode } from '../utils/prism'

interface DiffLineProps {
  line: DiffLineType
  viewMode: 'unified' | 'split'
  onMouseEnter: () => void
  onMouseLeave: () => void
  onAddComment: () => void
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
const AddCommentButton = ({ onClick }: { onClick: () => void }): React.ReactElement => (
  <button
    onClick={onClick}
    className="absolute -left-[26px] top-0 w-[22px] h-5 bg-[#0366d6] dark:bg-[#1f6feb] text-white rounded-[3px] text-base leading-5 cursor-pointer hidden group-hover:block hover:bg-[#0256c7] dark:hover:bg-[#388bfd] hover:scale-110 transition-transform p-0"
  >
    +
  </button>
)

export default function DiffLine({
  line,
  viewMode,
  onMouseEnter,
  onMouseLeave,
  onAddComment,
  filename,
  wrapLines = false
}: DiffLineProps): React.ReactElement {
  const config = LINE_TYPE_CONFIG[line.type]
  const isAddition = line.type === 'add' || line.type === 'added'
  const isDeletion = line.type === 'delete' || line.type === 'deleted'

  // Highlight the code content
  const highlightedContent = useMemo(() => {
    const language = getLanguageFromFilename(filename)
    // If content is empty, return empty string
    if (!line.content) {
      return ''
    }
    // Always highlight to preserve formatting
    return highlightCode(line.content, language)
  }, [line.content, filename])

  if (viewMode === 'unified') {
    return (
      <tr
        className={`group font-mono text-xs leading-5 diff-line ${config.class}`}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* Old Line Number */}
        <td className={`line-num w-[50px] min-w-[50px] px-[10px] text-center select-none border-r border-[#e1e4e8] dark:border-[#30363d] ${isDeletion ? 'line-num-deletion' : ''}`}>
          {line.oldLineNumber ?? line.oldNumber ?? ''}
        </td>

        {/* New Line Number */}
        <td className={`line-num w-[50px] min-w-[50px] px-[10px] text-center select-none border-r border-[#e1e4e8] dark:border-[#30363d] ${line.type === 'add' || line.type === 'added' ? 'line-num-addition' : ''}`}>
          {line.newLineNumber ?? line.newNumber ?? ''}
        </td>

        {/* Code Line */}
        <td className={`line-code px-[10px] py-0 relative w-full ${wrapLines ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'} ${config.codeClass}`} data-prefix={config.prefix}>
          <code className={`language-${getLanguageFromFilename(filename)}`} dangerouslySetInnerHTML={{ __html: highlightedContent }} />

          <AddCommentButton onClick={onAddComment} />
        </td>
      </tr>
    )
  }

  // Split view
  return (
    <>
      {isDeletion || line.type === 'normal' || line.type === 'context' ? (
        <>
          <td className={`line-num w-[50px] min-w-[50px] px-[10px] text-center select-none border-r border-[#e1e4e8] dark:border-[#30363d] ${isDeletion ? 'line-num-deletion' : ''}`}>
            {line.oldLineNumber ?? line.oldNumber ?? ''}
          </td>
          <td className={`line-code px-[10px] py-0 relative border-r-2 border-r-[#e1e4e8] dark:border-r-[#30363d] ${wrapLines ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'} ${config.codeClass}`} data-prefix={config.prefix}>
            <code className={`language-${getLanguageFromFilename(filename)}`} dangerouslySetInnerHTML={{ __html: highlightedContent }} />
            <AddCommentButton onClick={onAddComment} />
          </td>
        </>
      ) : (
        <>
          <td className={`line-num w-[50px] min-w-[50px] px-[10px] text-center select-none border-r border-[#e1e4e8] dark:border-[#30363d] ${isAddition ? 'line-num-addition' : ''}`}>
            {line.newLineNumber ?? line.newNumber ?? ''}
          </td>
          <td className={`line-code px-[10px] py-0 relative ${wrapLines ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'} ${config.codeClass}`} data-prefix={config.prefix}>
            <code className={`language-${getLanguageFromFilename(filename)}`} dangerouslySetInnerHTML={{ __html: highlightedContent }} />
            <AddCommentButton onClick={onAddComment} />
          </td>
        </>
      )}
    </>
  )
}
