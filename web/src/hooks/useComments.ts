import { useState, useCallback, useEffect, useContext } from 'react'
import type { Comment } from '../types/diff'
import { WebSocketContext } from '../contexts/WebSocketContext'

interface UseCommentsReturn {
  comments: Comment[]
  addComment: (file: string, line: number, content: string, lineEnd: number) => Promise<Comment>
  deleteComment: (id: string) => Promise<void>
  resolveComment: (id: string) => Promise<void>
  reopenComment: (id: string) => Promise<void>
  getCommentsForLine: (file: string, line: number) => Comment[]
  getCommentRangeLines: (file: string, lineOrder: number[]) => Set<number>
  formatCommentsForExport: () => string
}

export function useComments(currentDirectory?: string, selectedRevision?: string | null): UseCommentsReturn {
  const [comments, setComments] = useState<Comment[]>([])
  // Tolerate the absence of a WebSocketProvider (unit tests render
  // useComments directly with renderHook). Outside a provider the value
  // stays at zero, so the effect runs only on mount and on
  // currentDirectory changes — matching pre-WS-broadcast behavior.
  const wsContext = useContext(WebSocketContext)
  const lastCommentUpdate = wsContext?.lastCommentUpdate ?? 0

  // Fetch comments on mount, on directory change, and whenever the
  // server broadcasts a comment_changed event (e.g. an agent reply
  // posted through the MCP reply_to_comment tool).
  useEffect(() => {
    const fetchComments = async (): Promise<void> => {
      try {
        const response = await fetch('/api/review/comments')
        if (response.ok) {
          const data = await response.json() as Comment[]
          setComments(data)
        }
      } catch (error) {
        console.error('Failed to fetch comments:', error)
      }
    }

    void fetchComments()
  }, [currentDirectory, lastCommentUpdate])

  const addComment = useCallback(async (file: string, line: number, content: string, lineEnd: number) => {
    try {
      // selectedRevision is empty for the working-copy view; the server resolves
      // an empty revision to the working-copy commit (HEAD / @).
      const body: Record<string, unknown> = { file, line, content, lineEnd }
      if (selectedRevision) {
        body.revision = selectedRevision
      }
      const response = await fetch('/api/review/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        throw new Error('Failed to add comment')
      }

      const createdComment = await response.json() as Comment
      setComments(prev => [...prev, createdComment])
      return createdComment
    } catch (error) {
      console.error('Failed to add comment:', error)
      throw error
    }
  }, [selectedRevision])

  const setLocalStatus = (id: string, status: Comment['status']): void => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, status } : c))
  }

  const resolveComment = useCallback(async (id: string) => {
    const response = await fetch(`/api/review/comment/${id}/resolve`, { method: 'POST' })
    if (!response.ok) {
      throw new Error('Failed to resolve comment')
    }
    setLocalStatus(id, 'resolved')
  }, [])

  const reopenComment = useCallback(async (id: string) => {
    const response = await fetch(`/api/review/comment/${id}/reopen`, { method: 'POST' })
    if (!response.ok) {
      throw new Error('Failed to reopen comment')
    }
    setLocalStatus(id, 'open')
  }, [])

  const deleteComment = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/review/comment/${id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete comment')
      }

      setComments(prev => prev.filter(c => c.id !== id))
    } catch (error) {
      console.error('Failed to delete comment:', error)
      throw error
    }
  }, [])

  const getCommentsForLine = useCallback((file: string, line: number) => {
    return comments.filter(c => c.file === file && c.lineEnd === line)
  }, [comments])

  const getCommentRangeLines = useCallback((file: string, lineOrder: number[]): Set<number> => {
    const result = new Set<number>()
    const fileComments = comments.filter(c => c.file === file)
    for (const c of fileComments) {
      const startIdx = lineOrder.indexOf(c.line)
      const endIdx = lineOrder.indexOf(c.lineEnd)
      if (startIdx === -1 || endIdx === -1) continue
      const lo = Math.min(startIdx, endIdx)
      const hi = Math.max(startIdx, endIdx)
      for (let i = lo; i <= hi; i++) {
        result.add(lineOrder[i])
      }
    }
    return result
  }, [comments])

  const formatCommentsForExport = useCallback(() => {
    if (comments.length === 0) return ''

    // Group comments by file
    const byFile = new Map<string, Comment[]>()
    for (const c of comments) {
      const list = byFile.get(c.file) ?? []
      list.push(c)
      byFile.set(c.file, list)
    }

    const lines: string[] = ['# Review Comments', '']
    for (const [file, fileComments] of byFile) {
      lines.push(`## ${file}`)
      for (const c of fileComments) {
        const lineRef = c.line === c.lineEnd ? `Line ${c.line}` : `Lines ${c.line}-${c.lineEnd}`
        lines.push(`- **${lineRef}**: ${c.content}`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }, [comments])

  return {
    comments,
    addComment,
    deleteComment,
    resolveComment,
    reopenComment,
    getCommentsForLine,
    getCommentRangeLines,
    formatCommentsForExport
  }
}
