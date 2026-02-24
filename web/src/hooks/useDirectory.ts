import { useState, useEffect } from 'react'

interface UseDirectoryReturn {
  currentDirectory: string
  loading: boolean
  error: string | null
  changeDirectory: (dir: string) => Promise<void>
  validateDirectory: (dir: string) => Promise<{ valid: boolean; error?: string }>
  refetch: () => void
}

export function useDirectory(): UseDirectoryReturn {
  const [currentDirectory, setCurrentDirectory] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDirectory = async () => {
    try {
      const response = await fetch('/api/directory')
      if (!response.ok) throw new Error('Failed to fetch directory')
      const data = await response.json()
      setCurrentDirectory(data.directory)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const changeDirectory = async (dir: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: dir })
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to change directory')
      }
      const data = await response.json()
      setCurrentDirectory(data.directory)
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
      return await response.json()
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  useEffect(() => {
    fetchDirectory()
  }, [])

  return {
    currentDirectory,
    loading,
    error,
    changeDirectory,
    validateDirectory,
    refetch: fetchDirectory
  }
}
