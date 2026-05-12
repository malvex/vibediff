import type { Revision, VCSBackend } from '../types/diff'

interface RevisionListProps {
  revisions: Revision[]
  loading: boolean
  selectedRevision: string | null
  onSelectRevision: (revisionId: string | null) => void
  backend: VCSBackend
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
  backend,
}: RevisionListProps): React.ReactElement {
  if (loading) {
    return (
      <div className="text-xs text-fg-subtle p-2">
        Loading revisions...
      </div>
    )
  }

  return (
    <div className="overflow-y-auto">
      {/* Working copy option — only for git, since in jj the first revision IS the working copy */}
      {backend === 'git' && (
        <button
          onClick={() => { onSelectRevision(null); }}
          className={`w-full text-left px-2 py-1.5 text-xs border-b border-edge-subtle transition-colors cursor-pointer ${
            selectedRevision === null
              ? 'bg-accent-muted text-accent-emphasis'
              : 'text-fg hover:bg-surface-raised'
          }`}
        >
          <div className="font-medium">Working copy changes</div>
        </button>
      )}

      {revisions.map((rev) => {
        const isSelected = rev.isWorkingCopy && backend === 'jj'
          ? selectedRevision === null
          : selectedRevision === rev.id

        return (
          <button
            key={rev.id}
            onClick={() => {
              if (rev.isWorkingCopy && backend === 'jj') {
                onSelectRevision(null)
              } else {
                onSelectRevision(rev.id)
              }
            }}
            className={`w-full text-left px-2 py-1.5 text-xs border-b border-edge-subtle transition-colors cursor-pointer ${
              isSelected
                ? 'bg-accent-muted text-accent-emphasis'
                : 'text-fg hover:bg-surface-raised'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-surface-inset text-fg-muted shrink-0">
                {rev.shortId}
              </span>
              <span className="truncate">
                {rev.description || '(no description)'}
              </span>
              {rev.isWorkingCopy && (
                <span className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-accent-muted text-accent-emphasis">
                  @
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 mt-0.5 text-[10px] text-fg-muted">
              <span className="truncate">{rev.author}</span>
              <span>·</span>
              <span className="shrink-0">{formatTimestamp(rev.timestamp)}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
