export type DiffType = 'all' | 'staged' | 'unstaged'
export type ViewMode = 'unified' | 'split'

export interface FileDiff {
  path: string
  oldPath?: string
  isNew: boolean
  isDeleted: boolean
  isModified: boolean
  isRenamed: boolean
  additions: number
  deletions: number
  hunks: Hunk[]
}

export interface Hunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  header: string
  lines: DiffLine[]
}

export interface DiffLine {
  type: 'normal' | 'add' | 'delete' | 'context' | 'added' | 'deleted'
  oldLineNumber?: number
  newLineNumber?: number
  oldNumber?: number
  newNumber?: number
  content: string
}

export interface DiffResult {
  files: FileDiff[]
  type: DiffType
}

export interface Comment {
  id: string
  file: string
  line: number
  content: string
  createdAt: string
}
