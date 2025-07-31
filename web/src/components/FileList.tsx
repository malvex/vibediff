import type { FileDiff } from '../types/diff'

interface FileListProps {
  files: FileDiff[]
  selectedFile: FileDiff | null
  onSelectFile: (file: FileDiff) => void
  displayMode: 'single' | 'all'
  viewMode: 'list' | 'tree'
  collapsedFolders: Set<string>
  onToggleFolderCollapse: (folder: string) => void
}

export default function FileList({ files, selectedFile, onSelectFile, displayMode, viewMode, collapsedFolders, onToggleFolderCollapse }: FileListProps): React.ReactElement {
  const handleFileClick = (file: FileDiff): void => {
    onSelectFile(file)

    if (displayMode === 'all') {
      // Scroll to the file in the main view
      const element = document.getElementById(`file-${file.path.replace(/\//g, '-')}`)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }

  // Build tree structure for tree view
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

      // Build folder structure
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

      // Add file
      currentNode.children.push({
        name: parts[parts.length - 1],
        path: file.path,
        type: 'file',
        children: [],
        file
      })
    })

    // Sort folders first, then files
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
            onClick={() => { handleFileClick(file); }}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[13px] break-all transition-colors
              ${selectedFile?.path === node.file.path
                ? 'bg-[rgba(54,158,255,0.1)] dark:bg-[rgba(177,186,196,0.12)] border-l-[3px] border-l-[#2188ff] dark:border-l-[#f78166] -ml-[3px] pl-[calc(0.5rem-3px)]'
                : 'hover:bg-[#f0f3f6] dark:hover:bg-[rgba(255,255,255,0.05)]'
              }`}
            style={{ paddingLeft: `${String(depth * 20 + 8)}px` }}
          >
            <span className="flex-1 min-w-0">{node.name}</span>
            <div className="flex items-center gap-1 text-xs flex-shrink-0">
              <span className="text-[#28a745] dark:text-[#2ea043]">+{node.file.additions}</span>
              <span className="text-[#d73a49] dark:text-[#f85149]">-{node.file.deletions}</span>
            </div>
          </div>
        )
      }

      if (node.type === 'folder') {
        const isCollapsed = collapsedFolders.has(node.path)
        return (
          <div key={node.path} className="mb-0.5">
            <div
              className="flex items-center px-2 py-1 rounded-[3px] cursor-pointer select-none hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.05)]"
              onClick={() => {
                onToggleFolderCollapse(node.path)
              }}
              style={{ paddingLeft: `${String(depth * 20 + 8)}px` }}
            >
              <span className="mr-1.5 text-[10px] text-[#586069] dark:text-[#8b949e] font-mono inline-block w-3">
                {isCollapsed ? '▶' : '▼'}
              </span>
              <span className="font-medium text-sm">{node.name}</span>
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
          onClick={() => { handleFileClick(file); }}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[13px] break-all transition-colors
            ${selectedFile?.path === file.path
              ? 'bg-[rgba(54,158,255,0.1)] dark:bg-[rgba(177,186,196,0.12)] border-l-[3px] border-l-[#2188ff] dark:border-l-[#f78166] -ml-[3px] pl-[calc(0.5rem-3px)]'
              : 'hover:bg-[#f0f3f6] dark:hover:bg-[rgba(255,255,255,0.05)]'
            }`}
        >
          <span className="flex-1 min-w-0">{file.path}</span>
          <div className="flex items-center gap-1 text-xs flex-shrink-0">
            <span className="text-[#28a745] dark:text-[#2ea043]">+{file.additions}</span>
            <span className="text-[#d73a49] dark:text-[#f85149]">-{file.deletions}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
