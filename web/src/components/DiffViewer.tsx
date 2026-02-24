import { useState, useEffect } from 'react'
import type { DiffType, ViewMode, FileDiff as FileDiffType } from '../types/diff'
import { useDiff } from '../hooks/useDiff'
import { useComments } from '../hooks/useComments'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useWebSocketUpdates } from '../contexts/WebSocketContext'
import { useDirectory } from '../hooks/useDirectory'
import { useReviewedFiles } from '../hooks/useReviewedFiles'
import { getButtonClassName } from '../utils/buttonStyles'
import { Group, Panel, Separator } from 'react-resizable-panels'
import FileList from './FileList'
import FileDiff from './FileDiff'
import CommentDialog from './CommentDialog'
import FullFileModal from './FullFileModal'
import HelpModal from './HelpModal'
import DarkModeToggle from './DarkModeToggle'
import DirectorySwitcher from './DirectorySwitcher'

interface DiffViewerProps {
  className?: string
}

export default function DiffViewer({ className = '' }: DiffViewerProps): React.ReactElement {
  const [diffType, setDiffType] = useState<DiffType>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('unified')
  const [selectedFile, setSelectedFile] = useState<FileDiffType | null>(null)
  const [displayMode, setDisplayMode] = useState<'single' | 'all'>('single')
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set())
  const [commentDialog, setCommentDialog] = useState<{ file: string; line: number; lineEnd: number } | null>(null)
  const [fullFileModal, setFullFileModal] = useState<string | null>(null)
  const [fileViewMode, setFileViewMode] = useState<'list' | 'tree'>('list')
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const [wrapLines, setWrapLines] = useState<boolean>(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const { data, loading, error, refetch } = useDiff(diffType)
  const { addComment, deleteComment, getCommentsForLine, getCommentRangeLines } = useComments()
  const { lastUpdate } = useWebSocketUpdates()
  const { currentDirectory, changeDirectory, validateDirectory } = useDirectory()
  const { reviewedFiles, toggleReviewed, clearReviewed, validateReviewed } = useReviewedFiles(currentDirectory)

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

  // Auto-select first file when data loads and validate reviewed files
  useEffect(() => {
    if (data?.files.length) {
      // Validate reviewed files against current content
      validateReviewed(data.files)

      if (!selectedFile) {
        setSelectedFile(data.files[0])
      } else {
        // Preserve selected file if it still exists
        const stillExists = data.files.find(f => f.path === selectedFile.path)
        if (stillExists) {
          setSelectedFile(stillExists)
        } else {
          // File was deleted, select first file
          setSelectedFile(data.files[0])
        }
      }
    }
  }, [data, selectedFile, validateReviewed])

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
      } else if (e.key === 'r' && selectedFile && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        toggleReviewed(selectedFile)
      } else if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault()
        setShowHelp(true)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => { document.removeEventListener('keydown', handleKeyDown); }
  }, [data, selectedFile, toggleReviewed])

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


  const handleDirectoryChange = async (dir: string): Promise<void> => {
    await changeDirectory(dir)
    refetch()
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
    <>
      <div className={`flex flex-col h-screen bg-white dark:bg-[#0d1117] ${viewMode === 'split' ? 'split-view-active' : ''}`}>
      {/* Header - GitHub style dark header */}
      <header className="bg-[#24292e] dark:bg-[#161b22] text-white border-b border-[#e1e4e8] dark:border-[#30363d]">
        <div className="px-4 py-1.5">
          <div className="flex items-center justify-between flex-nowrap">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">VibeDiff</h1>
              <DirectorySwitcher
                currentDirectory={currentDirectory}
                onDirectoryChange={handleDirectoryChange}
                onValidate={validateDirectory}
              />
              {isRefreshing && (
                <span className="text-sm text-gray-400 animate-pulse">Updating...</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-nowrap whitespace-nowrap">
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

            <div className="border-l border-white/20 h-5" />

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

            <div className="border-l border-white/20 h-5" />

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

      <Group orientation="horizontal" className="min-h-[calc(100vh-53px)]" id="resize-group">
        {/* Sidebar */}
        <Panel defaultSize={20} minSize={15} maxSize={600} id="sidebar">
          <div className="h-full bg-[#fafbfc] dark:bg-[#0d1117] border-r border-[#e1e4e8] dark:border-[#30363d] p-2 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-[#24292e] dark:text-[#c9d1d9]">
                Files changed ({data?.files.length ?? 0})
                {reviewedFiles.size > 0 && (
                  <span className="ml-2 text-xs text-[#57606a] dark:text-[#8b949e]">
                    ({reviewedFiles.size} reviewed)
                  </span>
                )}
              </h3>

              <div className="flex items-center gap-2">
                {reviewedFiles.size > 0 && (
                  <button
                    onClick={clearReviewed}
                    className="text-xs px-1.5 py-0.5 text-[#57606a] dark:text-[#8b949e]
                               hover:text-[#24292e] dark:hover:text-[#c9d1d9]
                               hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]
                               rounded transition-colors"
                    title="Clear all reviewed marks"
                  >
                    Clear
                  </button>
                )}

                <button
                  onClick={() => { setFileViewMode(fileViewMode === 'list' ? 'tree' : 'list'); }}
                  className="text-base p-0.5 text-[#586069] dark:text-[#8b949e] hover:text-[#24292e] dark:hover:text-[#c9d1d9] transition-colors cursor-pointer bg-transparent border-none opacity-70 hover:opacity-100"
                  title={fileViewMode === 'list' ? 'Switch to tree view' : 'Switch to list view'}
                >
                  {fileViewMode === 'list' ? '◈' : '☰'}
                </button>
              </div>
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
              reviewedFiles={reviewedFiles}
              onToggleReviewed={toggleReviewed}
            />
          </div>
        </Panel>

        <Separator
          className="w-1.5 bg-[#d0d7de] dark:bg-[#30363d] hover:bg-[#0969da] dark:hover:bg-[#58a6ff] transition-colors"
          data-separator="resize-handle"
        />

        {/* Main Content */}
        <Panel defaultSize={80} minSize={40} id="main">
          <div className="h-full bg-white dark:bg-[#0d1117] p-3 overflow-y-auto">
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
                <p className="text-sm text-[#8b949e] dark:text-[#484f58]">No changes to display</p>
              </div>
            )
          }
          if (displayMode === 'all') {
            return (
          <div>
            {data.files.map((file) => (
              <FileDiff
                key={file.path}
                file={file}
                viewMode={viewMode}
                collapsed={collapsedFiles.has(file.path)}
                onToggleCollapse={() => { toggleFileCollapse(file.path); }}
                onAddComment={(line, lineEnd) => { setCommentDialog({ file: file.path, line, lineEnd }); }}
                onViewFullFile={() => { setFullFileModal(file.path); }}
                getCommentsForLine={getCommentsForLine}
                getCommentRangeLines={getCommentRangeLines}
                onDeleteComment={deleteComment}
                wrapLines={wrapLines}
              />
            ))}
          </div>
            )
          }
          if (selectedFile !== null) {
            return (
          <div>
            <FileDiff
              file={selectedFile}
              viewMode={viewMode}
              collapsed={false}
              onToggleCollapse={() => { /* Single file view doesn't collapse */ }}
              onAddComment={(line, lineEnd) => { setCommentDialog({ file: selectedFile.path, line, lineEnd }); }}
              onViewFullFile={() => { setFullFileModal(selectedFile.path); }}
              getCommentsForLine={getCommentsForLine}
              getCommentRangeLines={getCommentRangeLines}
              onDeleteComment={deleteComment}
              wrapLines={wrapLines}
            />
          </div>
            )
          }
          return (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-[#8b949e] dark:text-[#484f58]">Select a file to view changes</p>
            </div>
          )
        })()}
          </div>
        </Panel>
      </Group>

      {/* Comment Dialog */}
      <CommentDialog
        isOpen={!!commentDialog}
        file={commentDialog?.file ?? ''}
        line={commentDialog?.line ?? 0}
        lineEnd={commentDialog?.lineEnd ?? 0}
        onSubmit={(content) => {
          if (commentDialog) {
            void addComment(commentDialog.file, commentDialog.line, content, commentDialog.lineEnd).then(() => {
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
        getCommentRangeLines={getCommentRangeLines}
        onDeleteComment={deleteComment}
        onAddComment={(file, line, content, lineEnd) => {
          void addComment(file, line, content, lineEnd).catch((err: unknown) => {
            console.error('Failed to add comment:', err)
          })
        }}
        wrapLines={wrapLines}
      />

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelp}
        onClose={() => { setShowHelp(false); }}
      />
      </div>
    </>
  )
}
