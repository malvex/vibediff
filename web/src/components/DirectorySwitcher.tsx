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
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#c9d1d9] bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] hover:border-[#484f58] rounded transition-colors"
        title={currentDirectory}
      >
        <svg className="w-3.5 h-3.5 text-[#539bf5]" fill="currentColor" viewBox="0 0 16 16">
          <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"/>
        </svg>
        <span className="font-medium">{truncatePath(currentDirectory, 30)}</span>
        <svg className="w-2.5 h-2.5 ml-0.5" fill="currentColor" viewBox="0 0 16 16">
          <path d="M4 6l4 4 4-4z"/>
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-[500px] bg-[#ffffff] dark:bg-[#161b22] border border-[#d0d7de] dark:border-[#30363d] rounded-md shadow-xl z-50 max-h-[400px] overflow-auto">
          {/* Input Section */}
          <div className="p-3 border-b border-[#d0d7de] dark:border-[#30363d]">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInputChange()}
                placeholder="Enter directory path..."
                className="flex-1 px-3 py-1.5 border border-[#d0d7de] dark:border-[#30363d] rounded text-sm bg-[#ffffff] dark:bg-[#0d1117] text-[#24292f] dark:text-[#e6edf3] placeholder:text-[#57606a] dark:placeholder:text-[#7d8590] focus:border-[#0969da] dark:focus:border-[#1f6feb] focus:outline-none focus:ring-1 focus:ring-[#0969da] dark:focus:ring-[#1f6feb]"
              />
              <button
                onClick={handleInputChange}
                disabled={!inputValue || !!validationError || isValidating || isChanging}
                className="px-3 py-1.5 bg-[#1f6feb] text-white border border-[#1f6feb] rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#1a7feb] transition-colors"
              >
                {isChanging ? 'Changing...' : 'Change'}
              </button>
            </div>
            {isValidating && (
              <div className="mt-2 text-xs text-[#57606a] dark:text-[#7d8590]">Validating...</div>
            )}
            {validationError && (
              <div className="mt-2 text-xs text-[#cf222e] dark:text-[#f85149]">{validationError}</div>
            )}
          </div>

          {/* Current Directory */}
          <div className="p-3 border-b border-[#d0d7de] dark:border-[#30363d] bg-[#ddf4ff] dark:bg-[#1c2d41]">
            <div className="text-xs font-semibold text-[#57606a] dark:text-[#7d8590] mb-1">Current Directory</div>
            <div className="text-sm font-medium text-[#0969da] dark:text-[#58a6ff]" title={currentDirectory}>
              {currentDirectory}
            </div>
          </div>

          {/* Recent Directories */}
          {recentDirs.length > 0 && (
            <div className="p-2">
              <div className="text-xs font-semibold text-[#57606a] dark:text-[#7d8590] mb-2 px-2">Recent Directories</div>
              {recentDirs.map((dir: string) => (
                <div
                  key={dir}
                  className="flex items-center justify-between px-2 py-1.5 hover:bg-[#f6f8fa] dark:hover:bg-[#21262d] rounded group transition-colors"
                >
                  <button
                    onClick={() => handleDirectorySelect(dir)}
                    disabled={isChanging || dir === currentDirectory}
                    className="flex-1 text-left text-sm text-[#24292f] dark:text-[#e6edf3] truncate disabled:opacity-50 disabled:cursor-not-allowed"
                    title={dir}
                  >
                    {dir}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFromRecent(dir)
                    }}
                    className="ml-2 px-1.5 py-0.5 text-[#cf222e] dark:text-[#f85149] hover:bg-[#ffebe9] dark:hover:bg-[#3d1e20] rounded text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove from recent"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {recentDirs.length === 0 && (
            <div className="p-4 text-sm text-[#57606a] dark:text-[#7d8590] text-center">
              No recent directories
            </div>
          )}
        </div>
      )}
    </div>
  )
}
