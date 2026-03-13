import type { Revision } from '../types/diff'

interface RevisionListProps {
  revisions: Revision[]
  loading: boolean
  selectedRevision: string | null
  onSelectRevision: (revisionId: string | null) => void
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${String(diffMins)}m ago`
    if (diffHours < 24) return `${String(diffHours)}h ago`
    if (diffDays < 7) return `${String(diffDays)}d ago`
    return date.toLocaleDateString()
  } catch {
    return ts
  }
}

export default function RevisionList({
  revisions,
  loading,
  selectedRevision,
  onSelectRevision,
}: RevisionListProps): React.ReactElement {
  if (loading) {
    return (
      <div className="text-xs text-[#8b949e] dark:text-[#484f58] p-2">
        Loading revisions...
      </div>
    )
  }

  return (
    <div className="overflow-y-auto">
      {/* Working copy option */}
      <button
        onClick={() => { onSelectRevision(null); }}
        className={`w-full text-left px-2 py-1.5 text-xs border-b border-[#e1e4e8] dark:border-[#21262d] transition-colors cursor-pointer ${
          selectedRevision === null
            ? 'bg-[#ddf4ff] dark:bg-[#1f6feb33] text-[#0969da] dark:text-[#58a6ff]'
            : 'text-[#24292e] dark:text-[#c9d1d9] hover:bg-[#f3f4f6] dark:hover:bg-[#161b22]'
        }`}
      >
        <div className="font-medium">Working copy changes</div>
      </button>

      {revisions.map((rev) => (
        <button
          key={rev.id}
          onClick={() => { onSelectRevision(rev.id); }}
          className={`w-full text-left px-2 py-1.5 text-xs border-b border-[#e1e4e8] dark:border-[#21262d] transition-colors cursor-pointer ${
            selectedRevision === rev.id
              ? 'bg-[#ddf4ff] dark:bg-[#1f6feb33] text-[#0969da] dark:text-[#58a6ff]'
              : 'text-[#24292e] dark:text-[#c9d1d9] hover:bg-[#f3f4f6] dark:hover:bg-[#161b22]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-[#f0f3f6] dark:bg-[#21262d] text-[#57606a] dark:text-[#8b949e] shrink-0">
              {rev.shortId}
            </span>
            <span className="truncate">{rev.description || '(no description)'}</span>
          </div>
          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-[#57606a] dark:text-[#8b949e]">
            <span className="truncate">{rev.author}</span>
            <span>·</span>
            <span className="shrink-0">{formatTimestamp(rev.timestamp)}</span>
          </div>
        </button>
      ))}
    </div>
  )
}
