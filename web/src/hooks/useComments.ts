import { useState, useCallback, useEffect } from 'react'
import type { Comment } from '../types/diff'

interface UseCommentsReturn {
  comments: Comment[]
  addComment: (file: string, line: number, content: string, lineEnd: number) => Promise<Comment>
  deleteComment: (id: string) => Promise<void>
  getCommentsForLine: (file: string, line: number) => Comment[]
  getCommentRangeLines: (file: string, lineOrder: number[]) => Set<number>
  formatCommentsForExport: () => string
}

export function useComments(currentDirectory?: string): UseCommentsReturn {
  const [comments, setComments] = useState<Comment[]>([])

  // Fetch comments on mount and when directory changes
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
  }, [currentDirectory])

  const addComment = useCallback(async (file: string, line: number, content: string, lineEnd: number) => {
    try {
      const response = await fetch('/api/review/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, line, content, lineEnd })
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
    getCommentsForLine,
    getCommentRangeLines,
    formatCommentsForExport
  }
}
