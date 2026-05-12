import { useState, useEffect } from 'react'
import type { VCSBackend } from '../types/diff'

interface DirectoryResponse {
  directory: string
  backend?: VCSBackend
}

interface UseDirectoryReturn {
  currentDirectory: string
  backend: VCSBackend
  loading: boolean
  error: string | null
  changeDirectory: (dir: string) => Promise<void>
  validateDirectory: (dir: string) => Promise<{ valid: boolean; error?: string }>
  refetch: () => void
}

export function useDirectory(): UseDirectoryReturn {
  const [currentDirectory, setCurrentDirectory] = useState<string>('')
  const [backend, setBackend] = useState<VCSBackend>('git')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDirectory = async (): Promise<void> => {
    try {
      const response = await fetch('/api/directory')
      if (!response.ok) throw new Error('Failed to fetch directory')
      const data = await response.json() as DirectoryResponse
      setCurrentDirectory(data.directory)
      if (data.backend) setBackend(data.backend)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const changeDirectory = async (dir: string): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: dir })
      })
      if (!response.ok) {
        // Backend sends plain text errors via http.Error, not JSON
        const text = await response.text()
        throw new Error(text || 'Failed to change directory')
      }
      const data = await response.json() as DirectoryResponse
      setCurrentDirectory(data.directory)
      if (data.backend) setBackend(data.backend)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      throw err
    } finally {
      setLoading(false)
    }
  }

  const validateDirectory = async (dir: string): Promise<{ valid: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/directory/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: dir })
      })
      if (!response.ok) throw new Error('Validation request failed')
      return await response.json() as { valid: boolean; error?: string }
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  useEffect(() => {
    void fetchDirectory()
  }, [])

  return {
    currentDirectory,
    backend,
    loading,
    error,
    changeDirectory,
    validateDirectory,
    refetch: () => { void fetchDirectory() }
  }
}
