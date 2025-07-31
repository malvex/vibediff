import { useEffect } from 'react'

/**
 * Hook to automatically sync a value with localStorage
 * @param key - The localStorage key
 * @param value - The value to sync
 */
export function useLocalStorage(key: string, value: unknown): void {
  useEffect(() => {
    if (value === undefined || value === null) {
      return
    }

    try {
      let serialized: string
      if (value instanceof Set) {
        serialized = JSON.stringify([...value])
      } else if (typeof value === 'string') {
        serialized = value
      } else {
        serialized = JSON.stringify(value)
      }

      localStorage.setItem(key, serialized)
    } catch (error) {
      console.error(`Failed to save to localStorage key "${key}":`, error)
    }
  }, [key, value])
}
