import { useState, useEffect, useCallback } from 'react'
import type { DiffResult, DiffType } from '../types/diff'

interface UseDiffReturn {
  data: DiffResult | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useDiff(type: DiffType = 'all', revision?: string | null): UseDiffReturn {
  const [data, setData] = useState<DiffResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Shared fetch logic with optional loading state
  const fetchDiff = useCallback(async (showLoading = true): Promise<void> => {
    try {
      if (showLoading) {
        setLoading(true)
      }
      const params = new URLSearchParams()
      if (revision) {
        params.set('revision', revision)
      } else {
        params.set('type', type)
      }
      const response = await fetch(`/api/diff?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Failed to fetch diff')
      }
      const result = await response.json() as DiffResult
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }, [type, revision])

  // Initial fetch
  useEffect(() => {
    void fetchDiff(true)
  }, [fetchDiff])

  // Refetch without loading state
  const refetch = useCallback((): void => {
    void fetchDiff(false)
  }, [fetchDiff])

  return { data, loading, error, refetch }
}
