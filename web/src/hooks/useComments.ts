import { useState, useCallback, useEffect } from 'react'
import type { Comment } from '../types/diff'

interface UseCommentsReturn {
  comments: Comment[]
  addComment: (file: string, line: number, content: string) => Promise<Comment>
  deleteComment: (id: string) => Promise<void>
  getCommentsForLine: (file: string, line: number) => Comment[]
}

export function useComments(): UseCommentsReturn {
  const [comments, setComments] = useState<Comment[]>([])

  // Fetch existing comments on mount
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
  }, [])

  const addComment = useCallback(async (file: string, line: number, content: string) => {
    try {
      const response = await fetch('/api/review/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file,
          line,
          content
        })
      })

      if (!response.ok) {
        throw new Error('Failed to add comment')
      }

      // Get the created comment from response
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
    return comments.filter(c => c.file === file && c.line === line)
  }, [comments])

  return {
    comments,
    addComment,
    deleteComment,
    getCommentsForLine
  }
}
