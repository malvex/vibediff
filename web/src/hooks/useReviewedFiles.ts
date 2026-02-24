import { useState, useEffect, useCallback } from 'react'
import type { FileDiff } from '../types/diff'
import { computeFileHash } from '../utils/hashUtils'
import { loadReviewedFiles, saveReviewedFiles } from '../utils/reviewStorage'

/**
 * Custom hook for managing reviewed files with hash-based validation
 * and multi-project persistence
 */
export function useReviewedFiles(projectPath: string) {
  // Store hashes internally but expose a Set of paths for compatibility
  const [reviewedHashes, setReviewedHashes] = useState<Map<string, string>>(new Map())
  const [reviewedPaths, setReviewedPaths] = useState<Set<string>>(new Set())

  // Load reviewed files when project changes
  useEffect(() => {
    const loaded = loadReviewedFiles(projectPath)
    setReviewedHashes(loaded)
    setReviewedPaths(new Set(loaded.keys()))
  }, [projectPath])

  // Save to storage whenever hashes change
  useEffect(() => {
    saveReviewedFiles(projectPath, reviewedHashes)
  }, [projectPath, reviewedHashes])

  /**
   * Toggle reviewed status for a file
   */
  const toggleReviewed = useCallback((file: FileDiff) => {
    const hash = computeFileHash(file)

    setReviewedHashes(prev => {
      const newMap = new Map(prev)

      if (newMap.has(file.path)) {
        // Already reviewed, unmark it
        newMap.delete(file.path)
      } else {
        // Not reviewed, mark it with current hash
        newMap.set(file.path, hash)
      }

      return newMap
    })

    setReviewedPaths(prev => {
      const newSet = new Set(prev)
      if (newSet.has(file.path)) {
        newSet.delete(file.path)
      } else {
        newSet.add(file.path)
      }
      return newSet
    })
  }, [])

  /**
   * Clear all reviewed marks
   */
  const clearReviewed = useCallback(() => {
    setReviewedHashes(new Map())
    setReviewedPaths(new Set())
  }, [])

  /**
   * Validate reviewed files against current diff data
   * Clears reviewed marks for files whose content has changed
   */
  const validateReviewed = useCallback((files: FileDiff[]) => {
    let hasChanges = false

    setReviewedHashes(prev => {
      const newMap = new Map(prev)

      for (const file of files) {
        const storedHash = prev.get(file.path)
        if (storedHash) {
          const currentHash = computeFileHash(file)

          // If hashes don't match, clear the reviewed mark
          if (storedHash !== currentHash) {
            newMap.delete(file.path)
            hasChanges = true
          }
        }
      }

      return hasChanges ? newMap : prev
    })

    if (hasChanges) {
      setReviewedPaths(prev => {
        const newSet = new Set(prev)
        for (const file of files) {
          const storedHash = reviewedHashes.get(file.path)
          if (storedHash) {
            const currentHash = computeFileHash(file)
            if (storedHash !== currentHash) {
              newSet.delete(file.path)
            }
          }
        }
        return newSet
      })
    }
  }, [reviewedHashes])

  return {
    reviewedFiles: reviewedPaths,
    toggleReviewed,
    clearReviewed,
    validateReviewed
  }
}
