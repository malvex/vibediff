import React, { useState, useEffect, useRef } from 'react'

interface DirectorySwitcherProps {
  currentDirectory: string
  onDirectoryChange: (dir: string) => Promise<void>
  onValidate: (dir: string) => Promise<{ valid: boolean; error?: string }>
}

export default function DirectorySwitcher({
  currentDirectory,
  onDirectoryChange,
  onValidate
}: DirectorySwitcherProps): React.ReactElement {
  const [recentDirs, setRecentDirs] = useState<string[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isChanging, setIsChanging] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const validationTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Load recent directories from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('recentDirectories')
    if (saved) {
      try {
        setRecentDirs(JSON.parse(saved) as string[])
      } catch (e) {
        console.error('Failed to parse recent directories', e)
      }
    }
  }, [])

  // Save recent directories to localStorage when they change
  useEffect(() => {
    if (recentDirs.length > 0) {
      localStorage.setItem('recentDirectories', JSON.stringify(recentDirs))
    }
  }, [recentDirs])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Debounced validation
  useEffect(() => {
    if (inputValue && inputValue !== currentDirectory) {
      setIsValidating(true)
      setValidationError(null)

      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current)
      }

      validationTimeoutRef.current = setTimeout(async () => {
        const result = await onValidate(inputValue)
        setIsValidating(false)
        if (!result.valid) {
          setValidationError(result.error || 'Invalid directory')
        }
      }, 300)
    } else {
      setValidationError(null)
      setIsValidating(false)
    }

    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current)
      }
    }
  }, [inputValue, currentDirectory, onValidate])

  const handleDirectorySelect = async (dir: string) => {
    setIsChanging(true)
    try {
      await onDirectoryChange(dir)
      addToRecent(dir)
      setIsOpen(false)
      setInputValue('')
    } catch (err) {
      // Error handled by parent
    } finally {
      setIsChanging(false)
    }
  }

  const handleInputChange = async () => {
    if (!inputValue || validationError || isValidating) return
    await handleDirectorySelect(inputValue)
  }

  const addToRecent = (dir: string) => {
    const newRecent = [dir, ...recentDirs.filter((d: string) => d !== dir)].slice(0, 10)
    setRecentDirs(newRecent)
  }

  const removeFromRecent = (dir: string) => {
    setRecentDirs(recentDirs.filter((d: string) => d !== dir))
  }

  const truncatePath = (path: string, maxLength: number = 40) => {
    if (path.length <= maxLength) return path
    return '...' + path.slice(-(maxLength - 3))
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-white hover:bg-gray-700 rounded"
        title={currentDirectory}
      >
        <span>📁</span>
        <span>{truncatePath(currentDirectory, 30)}</span>
        <span className="text-xs">▼</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-[500px] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg z-50 max-h-[400px] overflow-auto">
          {/* Input Section */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInputChange()}
                placeholder="Enter directory path..."
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-900 dark:text-white"
              />
              <button
                onClick={handleInputChange}
                disabled={!inputValue || !!validationError || isValidating || isChanging}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
              >
                {isChanging ? 'Changing...' : 'Change'}
              </button>
            </div>
            {isValidating && (
              <div className="mt-2 text-xs text-gray-500">Validating...</div>
            )}
            {validationError && (
              <div className="mt-2 text-xs text-red-600 dark:text-red-400">{validationError}</div>
            )}
          </div>

          {/* Current Directory */}
          <div className="p-2 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20">
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Current Directory</div>
            <div className="text-sm font-medium dark:text-white" title={currentDirectory}>
              {currentDirectory}
            </div>
          </div>

          {/* Recent Directories */}
          {recentDirs.length > 0 && (
            <div className="p-2">
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-2 px-2">Recent Directories</div>
              {recentDirs.map((dir: string) => (
                <div
                  key={dir}
                  className="flex items-center justify-between px-2 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded group"
                >
                  <button
                    onClick={() => handleDirectorySelect(dir)}
                    disabled={isChanging || dir === currentDirectory}
                    className="flex-1 text-left text-sm dark:text-white truncate disabled:opacity-50"
                    title={dir}
                  >
                    {dir}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFromRecent(dir)
                    }}
                    className="ml-2 px-2 py-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove from recent"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {recentDirs.length === 0 && (
            <div className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
              No recent directories
            </div>
          )}
        </div>
      )}
    </div>
  )
}
