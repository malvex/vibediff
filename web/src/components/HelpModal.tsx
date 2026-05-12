import { useEffect, useCallback } from 'react'

interface HelpModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function HelpModal({ isOpen, onClose }: HelpModalProps): React.ReactElement | null {
  const handleKeyDown = useCallback((e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      onClose()
    }
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => { document.removeEventListener('keydown', handleKeyDown); }
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-overlay backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-edge rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto m-4"
        onClick={(e) => { e.stopPropagation(); }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface-raised border-b border-edge px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-fg">
            VibeDiff Help
          </h2>
          <button
            onClick={onClose}
            className="text-fg-muted hover:text-fg text-2xl leading-none"
            title="Close (Esc)"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-6">
          {/* Keyboard Shortcuts */}
          <section>
            <h3 className="text-md font-semibold text-fg mb-3">
              Keyboard Shortcuts
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-1.5">
                <span className="text-fg-muted">Navigate files</span>
                <div className="flex gap-2">
                  <kbd className="px-2 py-1 bg-surface-raised border border-edge rounded text-xs font-mono">↑</kbd>
                  <kbd className="px-2 py-1 bg-surface-raised border border-edge rounded text-xs font-mono">↓</kbd>
                  <span className="text-fg-muted">or</span>
                  <kbd className="px-2 py-1 bg-surface-raised border border-edge rounded text-xs font-mono">j</kbd>
                  <kbd className="px-2 py-1 bg-surface-raised border border-edge rounded text-xs font-mono">k</kbd>
                </div>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-fg-muted">Toggle reviewed status</span>
                <kbd className="px-2 py-1 bg-surface-raised border border-edge rounded text-xs font-mono">r</kbd>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-fg-muted">Show help</span>
                <kbd className="px-2 py-1 bg-surface-raised border border-edge rounded text-xs font-mono">?</kbd>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-fg-muted">Close modal/dialog</span>
                <kbd className="px-2 py-1 bg-surface-raised border border-edge rounded text-xs font-mono">Esc</kbd>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-fg-muted">Refresh browser</span>
                <div className="flex gap-2">
                  <kbd className="px-2 py-1 bg-surface-raised border border-edge rounded text-xs font-mono">⌘ R</kbd>
                  <span className="text-fg-muted">or</span>
                  <kbd className="px-2 py-1 bg-surface-raised border border-edge rounded text-xs font-mono">Ctrl R</kbd>
                </div>
              </div>
            </div>
          </section>

          {/* UI Features */}
          <section>
            <h3 className="text-md font-semibold text-fg mb-3">
              UI Features
            </h3>
            <ul className="space-y-2 text-sm text-fg-muted">
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">•</span>
                <span><strong className="text-fg">Resizable Sidebar:</strong> Drag the divider between the file list and diff viewer to resize. Width persists across sessions.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">•</span>
                <span><strong className="text-fg">View Modes:</strong> Switch between unified and split diff views, or view a single file vs all files at once.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">•</span>
                <span><strong className="text-fg">Dark Mode:</strong> Toggle between light and dark themes using the moon/sun icon in the header.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">•</span>
                <span><strong className="text-fg">File Tree/List:</strong> Switch between hierarchical tree view and flat list view using the icon in the sidebar header.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">•</span>
                <span><strong className="text-fg">Line Wrapping:</strong> Toggle line wrapping for long lines using the "Wrap Lines" button in the header.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">•</span>
                <span><strong className="text-fg">Inline Comments:</strong> Add comments to specific lines by clicking the "+" button next to any line.</span>
              </li>
            </ul>
          </section>

          {/* Review Workflow */}
          <section>
            <h3 className="text-md font-semibold text-fg mb-3">
              Review Workflow
            </h3>
            <ul className="space-y-2 text-sm text-fg-muted">
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">•</span>
                <span><strong className="text-fg">Reviewed Files:</strong> Check the checkbox next to a file or press <kbd className="px-1.5 py-0.5 bg-surface-raised border border-edge rounded text-xs font-mono">r</kbd> to mark it as reviewed.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">•</span>
                <span><strong className="text-fg">Smart Tracking:</strong> Reviewed marks are validated against file content - if a file changes, the reviewed mark is automatically cleared.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">•</span>
                <span><strong className="text-fg">Multi-Project:</strong> Reviewed files are tracked per directory. Switch directories and your progress is preserved.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">•</span>
                <span><strong className="text-fg">Clear Reviewed:</strong> Click the "Clear" button in the sidebar header to reset all reviewed marks for the current project.</span>
              </li>
            </ul>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-surface-raised border-t border-edge px-6 py-3">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-accent hover:bg-accent-emphasis text-accent-fg rounded-md text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
