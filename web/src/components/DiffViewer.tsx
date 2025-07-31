import { useState, useEffect } from 'react'
import type { DiffType, ViewMode, FileDiff as FileDiffType } from '../types/diff'
import { useDiff } from '../hooks/useDiff'
import { useComments } from '../hooks/useComments'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useWebSocketUpdates } from '../contexts/WebSocketContext'
import { getButtonClassName } from '../utils/buttonStyles'
import FileList from './FileList'
import FileDiff from './FileDiff'
import CommentDialog from './CommentDialog'
import FullFileModal from './FullFileModal'
import DarkModeToggle from './DarkModeToggle'

interface DiffViewerProps {
  className?: string
}

export default function DiffViewer({ className = '' }: DiffViewerProps): React.ReactElement {
  const [diffType, setDiffType] = useState<DiffType>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('unified')
  const [selectedFile, setSelectedFile] = useState<FileDiffType | null>(null)
  const [displayMode, setDisplayMode] = useState<'single' | 'all'>('single')
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set())
  const [commentDialog, setCommentDialog] = useState<{ file: string; line: number } | null>(null)
  const [fullFileModal, setFullFileModal] = useState<string | null>(null)
  const [fileViewMode, setFileViewMode] = useState<'list' | 'tree'>('list')
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const [wrapLines, setWrapLines] = useState<boolean>(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const { data, loading, error, refetch } = useDiff(diffType)
  const { addComment, deleteComment, getCommentsForLine } = useComments()
  const { lastUpdate } = useWebSocketUpdates()

  // Refetch when WebSocket triggers an update
  useEffect(() => {
    setIsRefreshing(true)
    refetch()
    // Clear refreshing indicator after a short delay
    const timer = setTimeout(() => { setIsRefreshing(false); }, 500)
    return () => { clearTimeout(timer); }
  }, [lastUpdate, refetch])

  // Load preferences from localStorage
  useEffect(() => {
    const savedViewMode = localStorage.getItem('viewMode') as ViewMode | null
    if (savedViewMode !== null) setViewMode(savedViewMode)

    const savedDisplayMode = localStorage.getItem('displayMode') as 'single' | 'all' | null
    if (savedDisplayMode !== null) setDisplayMode(savedDisplayMode)

    const savedCollapsed = localStorage.getItem('collapsedFiles')
    if (savedCollapsed) {
      try {
        setCollapsedFiles(new Set(JSON.parse(savedCollapsed) as string[]))
      } catch (e) {
        console.error('Failed to parse collapsed files', e)
      }
    }

    const savedFileViewMode = localStorage.getItem('sidebarView') as 'list' | 'tree' | null
    if (savedFileViewMode !== null) setFileViewMode(savedFileViewMode)

    const savedCollapsedFolders = localStorage.getItem('collapsedFolders')
    if (savedCollapsedFolders) {
      try {
        setCollapsedFolders(new Set(JSON.parse(savedCollapsedFolders) as string[]))
      } catch (e) {
        console.error('Failed to parse collapsed folders', e)
      }
    }

    const savedWrapLines = localStorage.getItem('wrapLines')
    if (savedWrapLines !== null) setWrapLines(savedWrapLines === 'true')
  }, [])

  // Save preferences using the custom hook
  useLocalStorage('viewMode', viewMode)
  useLocalStorage('displayMode', displayMode)
  useLocalStorage('collapsedFiles', collapsedFiles)
  useLocalStorage('sidebarView', fileViewMode)
  useLocalStorage('collapsedFolders', collapsedFolders)
  useLocalStorage('wrapLines', wrapLines)

  // Auto-select first file when data loads
  useEffect(() => {
    if (data?.files.length && !selectedFile) {
      setSelectedFile(data.files[0])
    } else if (selectedFile && data?.files.length) {
      // Preserve selected file if it still exists
      const stillExists = data.files.find(f => f.path === selectedFile.path)
      if (stillExists) {
        setSelectedFile(stillExists)
      } else {
        // File was deleted, select first file
        setSelectedFile(data.files[0])
      }
    }
  }, [data, selectedFile])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!data?.files.length || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      const currentIndex = selectedFile ? data.files.findIndex(f => f.path === selectedFile.path) : -1

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        const nextIndex = currentIndex + 1
        if (nextIndex < data.files.length) {
          setSelectedFile(data.files[nextIndex])
        }
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        const prevIndex = currentIndex - 1
        if (prevIndex >= 0) {
          setSelectedFile(data.files[prevIndex])
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => { document.removeEventListener('keydown', handleKeyDown); }
  }, [data, selectedFile])

  const toggleFileCollapse = (filePath: string): void => {
    setCollapsedFiles(prev => {
      const newSet = new Set(prev)
      if (newSet.has(filePath)) {
        newSet.delete(filePath)
      } else {
        newSet.add(filePath)
      }
      return newSet
    })
  }

  const toggleAllCollapse = (): void => {
    if (collapsedFiles.size === data?.files.length) {
      // All collapsed, expand all
      setCollapsedFiles(new Set())
    } else {
      // Some or none collapsed, collapse all
      setCollapsedFiles(new Set(data?.files.map(f => f.path) ?? []))
    }
  }

  if (loading) {
    return (
      <div className={`flex justify-center items-center h-screen ${className}`}>
        <div className="text-gray-500 dark:text-gray-400">Loading diff...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`flex justify-center items-center h-screen ${className}`}>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400">Error: {error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-screen bg-white dark:bg-[#0d1117] ${viewMode === 'split' ? 'split-view-active' : ''}`}>
      {/* Header - GitHub style dark header */}
      <header className="bg-[#24292e] dark:bg-[#161b22] text-white border-b border-[#e1e4e8] dark:border-[#30363d]">
        <div className="max-w-[1280px] mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-nowrap">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">VibeDiff</h1>
              {isRefreshing && (
                <span className="text-sm text-gray-400 animate-pulse">Updating...</span>
              )}
            </div>
            <div className="flex items-center gap-4 flex-nowrap whitespace-nowrap">
            {/* Diff Type Selector */}
            <div className="flex">
              {(['all', 'staged', 'unstaged'] as DiffType[]).map((type, index) => (
                <button
                  key={type}
                  onClick={() => { setDiffType(type); }}
                  className={(() => {
                    const isActive = diffType === type
                    if (index === 0) return getButtonClassName(isActive, 'left')
                    if (index === 2) return getButtonClassName(isActive, 'right')
                    return getButtonClassName(isActive, 'middle')
                  })()}
                >
                  {type === 'all' ? 'All Changes' : type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>

            {/* View Mode Toggle */}
            <div className="flex">
              <button
                onClick={() => { setViewMode('unified'); }}
                className={getButtonClassName(viewMode === 'unified', 'left')}
              >
                Unified
              </button>
              <button
                onClick={() => { setViewMode('split'); }}
                className={getButtonClassName(viewMode === 'split', 'right')}
              >
                Split
              </button>
            </div>

            {/* Display Mode Toggle */}
            <div className="flex">
              <button
                onClick={() => { setDisplayMode('single'); }}
                className={getButtonClassName(displayMode === 'single', 'left')}
              >
                Single File
              </button>
              <button
                onClick={() => { setDisplayMode('all'); }}
                className={getButtonClassName(displayMode === 'all', 'right')}
              >
                All Files
              </button>
            </div>

            {/* Collapse All Button */}
            <button
              onClick={toggleAllCollapse}
              className={`${getButtonClassName(false, 'single')} disabled:opacity-50 disabled:cursor-not-allowed`}
              disabled={displayMode === 'single'}
              title={displayMode === 'single' ? 'Available in All Files mode' : ''}
            >
              {collapsedFiles.size === data?.files.length ? 'Expand All' : 'Collapse All'}
            </button>

            {/* Wrap Lines Toggle */}
            <button
              onClick={() => { setWrapLines(!wrapLines); }}
              className={getButtonClassName(wrapLines, 'single')}
              title="Toggle line wrapping"
            >
              Wrap Lines
            </button>

            <DarkModeToggle />
            </div>
          </div>
        </div>
      </header>

      <div className="flex max-w-[1280px] mx-auto min-h-[calc(100vh-65px)] w-full">
        {/* Sidebar */}
        <div className="w-[260px] bg-[#fafbfc] dark:bg-[#0d1117] border-r border-[#e1e4e8] dark:border-[#30363d] p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#24292e] dark:text-[#c9d1d9]">
              Files changed ({data?.files.length ?? 0})
            </h3>
            <button
              onClick={() => { setFileViewMode(fileViewMode === 'list' ? 'tree' : 'list'); }}
              className="text-base p-0.5 text-[#586069] dark:text-[#8b949e] hover:text-[#24292e] dark:hover:text-[#c9d1d9] transition-colors cursor-pointer bg-transparent border-none opacity-70 hover:opacity-100"
              title={fileViewMode === 'list' ? 'Switch to tree view' : 'Switch to list view'}
            >
              {fileViewMode === 'list' ? '◈' : '☰'}
            </button>
          </div>

          {/* File List */}
          <FileList
            files={data?.files ?? []}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            displayMode={displayMode}
            viewMode={fileViewMode}
            collapsedFolders={collapsedFolders}
            onToggleFolderCollapse={(folder) => {
              setCollapsedFolders(prev => {
                const newSet = new Set(prev)
                if (newSet.has(folder)) {
                  newSet.delete(folder)
                } else {
                  newSet.add(folder)
                }
                return newSet
              })
            }}
          />
        </div>

        {/* Main Content */}
        <div className="flex-1 bg-white dark:bg-[#0d1117] p-4 overflow-y-auto">
        {(() => {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (loading) {
            return (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500 dark:text-gray-400">Loading...</p>
              </div>
            )
          }
          if (error) {
            return (
              <div className="flex items-center justify-center h-full">
                <p className="text-red-500">Error loading diff: {error}</p>
              </div>
            )
          }
          if (!data || data.files.length === 0) {
            return (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500 dark:text-gray-400">No changes to display</p>
              </div>
            )
          }
          if (displayMode === 'all') {
            return (
          <div className="p-6">
            {data.files.map((file) => (
              <FileDiff
                key={file.path}
                file={file}
                viewMode={viewMode}
                collapsed={collapsedFiles.has(file.path)}
                onToggleCollapse={() => { toggleFileCollapse(file.path); }}
                onAddComment={(line) => { setCommentDialog({ file: file.path, line }); }}
                onViewFullFile={() => { setFullFileModal(file.path); }}
                getCommentsForLine={getCommentsForLine}
                onDeleteComment={deleteComment}
                wrapLines={wrapLines}
              />
            ))}
          </div>
            )
          }
          if (selectedFile !== null) {
            return (
          <div className="p-6">
            <FileDiff
              file={selectedFile}
              viewMode={viewMode}
              collapsed={false}
              onToggleCollapse={() => { /* Single file view doesn't collapse */ }}
              onAddComment={(line) => { setCommentDialog({ file: selectedFile.path, line }); }}
              onViewFullFile={() => { setFullFileModal(selectedFile.path); }}
              getCommentsForLine={getCommentsForLine}
              onDeleteComment={deleteComment}
              wrapLines={wrapLines}
            />
          </div>
            )
          }
          return (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500 dark:text-gray-400">Select a file to view changes</p>
            </div>
          )
        })()}
        </div>

      {/* Comment Dialog */}
      <CommentDialog
        isOpen={!!commentDialog}
        file={commentDialog?.file ?? ''}
        line={commentDialog?.line ?? 0}
        onSubmit={(content) => {
          if (commentDialog) {
            void addComment(commentDialog.file, commentDialog.line, content).then(() => {
              setCommentDialog(null)
            }).catch((err: unknown) => {
              console.error('Failed to add comment:', err)
            })
          }
        }}
        onClose={() => { setCommentDialog(null); }}
      />

      {/* Full File Modal */}
      <FullFileModal
        isOpen={!!fullFileModal}
        filePath={fullFileModal ?? ''}
        onClose={() => { setFullFileModal(null); }}
        viewMode={viewMode}
        getCommentsForLine={getCommentsForLine}
        onDeleteComment={deleteComment}
        onAddComment={(file, line, content) => {
          void addComment(file, line, content).catch((err: unknown) => {
            console.error('Failed to add comment:', err)
          })
        }}
        wrapLines={wrapLines}
      />
      </div>
    </div>
  )
}
