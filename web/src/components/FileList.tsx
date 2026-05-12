import type { FileDiff } from '../types/diff'

interface FileListProps {
  files: FileDiff[]
  selectedFile: FileDiff | null
  onSelectFile: (file: FileDiff) => void
  displayMode: 'single' | 'all'
  viewMode: 'list' | 'tree'
  collapsedFolders: Set<string>
  onToggleFolderCollapse: (folder: string) => void
  reviewedFiles: Set<string>
  onToggleReviewed: (file: FileDiff) => void
}

export default function FileList({ files, selectedFile, onSelectFile, displayMode, viewMode, collapsedFolders, onToggleFolderCollapse, reviewedFiles, onToggleReviewed }: FileListProps): React.ReactElement {
  const handleFileClick = (file: FileDiff): void => {
    onSelectFile(file)

    if (displayMode === 'all') {
      const element = document.getElementById(`file-${file.path.replace(/\//g, '-')}`)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }

  interface TreeNode {
    name: string
    path: string
    type: 'folder' | 'file'
    children: TreeNode[]
    file?: FileDiff
  }

  const buildTree = (): TreeNode => {
    const root: TreeNode = { name: 'root', path: '', type: 'folder', children: [] }

    files.forEach(file => {
      const parts = file.path.split('/')
      let currentNode = root

      for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i]
        const folderPath = parts.slice(0, i + 1).join('/')

        let folder = currentNode.children.find(
          child => child.type === 'folder' && child.name === folderName
        )

        if (!folder) {
          folder = {
            name: folderName,
            path: folderPath,
            type: 'folder',
            children: []
          }
          currentNode.children.push(folder)
        }

        currentNode = folder
      }

      currentNode.children.push({
        name: parts[parts.length - 1],
        path: file.path,
        type: 'file',
        children: [],
        file
      })
    })

    const sortNodes = (node: TreeNode): void => {
      node.children.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name)
        }
        return a.type === 'folder' ? -1 : 1
      })
      node.children.forEach(child => {
        if (child.type === 'folder') {
          sortNodes(child)
        }
      })
    }

    sortNodes(root)
    return root
  }

  if (viewMode === 'tree') {
    const tree = buildTree()

    const renderTreeNode = (node: TreeNode, depth = 0): React.ReactElement | null => {
      if (node.type === 'file' && node.file) {
        const file = node.file
        return (
          <div
            key={node.path}
            onClick={(e) => {
              if (e.target instanceof HTMLInputElement) return
              handleFileClick(file)
            }}
            className={`flex items-center gap-2 px-1.5 py-0.5 rounded cursor-pointer text-xs break-all transition-colors
              ${selectedFile?.path === node.file.path
                ? 'bg-accent-muted border-l-2 border-l-accent -ml-[2px] pl-[calc(0.375rem-2px)] text-accent-emphasis font-medium'
                : 'text-fg hover:bg-surface-raised'
              }`}
            style={{ paddingLeft: `${String(depth * 16 + 6)}px` }}
          >
            <input
              type="checkbox"
              checked={reviewedFiles.has(file.path)}
              onChange={(e) => {
                e.stopPropagation()
                onToggleReviewed(file)
              }}
              onClick={(e) => { e.stopPropagation(); }}
              className="w-4 h-4 rounded border-edge text-accent cursor-pointer flex-shrink-0
                         focus:ring-2 focus:ring-accent"
              title="Mark as reviewed"
            />
            <span className={`flex-1 min-w-0 ${reviewedFiles.has(file.path) ? 'opacity-60' : ''}`}>
              {node.name}
            </span>
            <div className="flex items-center gap-1 text-xs flex-shrink-0">
              <span className="text-success">+{file.additions}</span>
              <span className="text-danger">-{file.deletions}</span>
            </div>
          </div>
        )
      }

      if (node.type === 'folder') {
        const isCollapsed = collapsedFolders.has(node.path)
        return (
          <div key={node.path} className="mb-0.5">
            <div
              className="flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer select-none hover:bg-surface-inset transition-colors"
              onClick={() => {
                onToggleFolderCollapse(node.path)
              }}
              style={{ paddingLeft: `${String(depth * 16 + 6)}px` }}
            >
              <svg
                className={`w-2.5 h-2.5 flex-shrink-0 text-fg-muted transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                fill="currentColor"
                viewBox="0 0 16 16"
              >
                <path d="M6 4l4 4-4 4V4z"/>
              </svg>
              <svg
                className="w-3.5 h-3.5 flex-shrink-0 text-accent"
                fill="currentColor"
                viewBox="0 0 16 16"
              >
                <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"/>
              </svg>
              <span className="text-xs font-semibold text-fg truncate">{node.name}</span>
            </div>
            <div style={{ display: isCollapsed ? 'none' : 'block' }}>
              {node.children.map(child => renderTreeNode(child, depth + 1))}
            </div>
          </div>
        )
      }

      return null
    }

    return (
      <div className="flex flex-col gap-0.5">
        {tree.children.map(child => renderTreeNode(child, 0))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      {files.map((file) => (
        <div
          key={file.path}
          onClick={(e) => {
            if (e.target instanceof HTMLInputElement) return
            handleFileClick(file)
          }}
          className={`flex items-center gap-2 px-1.5 py-0.5 rounded cursor-pointer text-xs break-all transition-colors
            ${selectedFile?.path === file.path
              ? 'bg-accent-muted border-l-2 border-l-accent -ml-[2px] pl-[calc(0.375rem-2px)] text-accent-emphasis font-medium'
              : 'text-fg hover:bg-surface-raised'
            }`}
        >
          <input
            type="checkbox"
            checked={reviewedFiles.has(file.path)}
            onChange={(e) => {
              e.stopPropagation()
              onToggleReviewed(file)
            }}
            onClick={(e) => { e.stopPropagation(); }}
            className="w-4 h-4 rounded border-edge text-accent cursor-pointer flex-shrink-0
                       focus:ring-2 focus:ring-accent"
            title="Mark as reviewed"
          />
          <span className={`flex-1 min-w-0 ${reviewedFiles.has(file.path) ? 'opacity-60' : ''}`}>
            {file.path}
          </span>
          <div className="flex items-center gap-1 text-xs flex-shrink-0">
            <span className="text-success">+{file.additions}</span>
            <span className="text-danger">-{file.deletions}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
