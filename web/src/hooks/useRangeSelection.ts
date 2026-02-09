import { useState, useCallback, useEffect, useRef, useMemo } from 'react'

interface UseRangeSelectionOptions {
  lineOrder: number[]
  onSelect: (line: number, lineEnd?: number) => void
}

interface UseRangeSelectionReturn {
  handleDragStart: (lineNumber: number) => void
  handleDragEnter: (lineNumber: number) => void
  selectedLines: ReadonlySet<number>
  isDragging: boolean
}

export function useRangeSelection({ lineOrder, onSelect }: UseRangeSelectionOptions): UseRangeSelectionReturn {
  const [selectedLines, setSelectedLines] = useState<ReadonlySet<number>>(new Set())
  const [isDragging, setIsDragging] = useState(false)

  const startRef = useRef<number | null>(null)
  const currentRef = useRef<number | null>(null)
  const prevMinRef = useRef<number>(-1)
  const prevMaxRef = useRef<number>(-1)

  const indexMap = useMemo(
    () => new Map(lineOrder.map((ln, i) => [ln, i])),
    [lineOrder]
  )

  const computeSelectedLines = useCallback(() => {
    const start = startRef.current
    const current = currentRef.current
    if (start === null || current === null) return

    const startIdx = indexMap.get(start)
    const currentIdx = indexMap.get(current)
    if (startIdx === undefined || currentIdx === undefined) return

    const minIdx = Math.min(startIdx, currentIdx)
    const maxIdx = Math.max(startIdx, currentIdx)

    // Skip update if range hasn't changed
    if (minIdx === prevMinRef.current && maxIdx === prevMaxRef.current) return
    prevMinRef.current = minIdx
    prevMaxRef.current = maxIdx

    const newSet = new Set<number>()
    for (let i = minIdx; i <= maxIdx; i++) {
      newSet.add(lineOrder[i])
    }
    setSelectedLines(newSet)
  }, [indexMap, lineOrder])

  const handleDragStart = useCallback((lineNumber: number) => {
    startRef.current = lineNumber
    currentRef.current = lineNumber
    prevMinRef.current = -1
    prevMaxRef.current = -1
    setIsDragging(true)
    setSelectedLines(new Set([lineNumber]))
  }, [])

  const handleDragEnter = useCallback((lineNumber: number) => {
    if (startRef.current === null) return
    currentRef.current = lineNumber
    computeSelectedLines()
  }, [computeSelectedLines])

  const cancelDrag = useCallback(() => {
    startRef.current = null
    currentRef.current = null
    prevMinRef.current = -1
    prevMaxRef.current = -1
    setIsDragging(false)
    setSelectedLines(new Set())
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseUp = (): void => {
      const start = startRef.current
      const current = currentRef.current
      if (start !== null && current !== null) {
        const startIdx = indexMap.get(start)
        const currentIdx = indexMap.get(current)
        if (startIdx !== undefined && currentIdx !== undefined) {
          const minIdx = Math.min(startIdx, currentIdx)
          const maxIdx = Math.max(startIdx, currentIdx)
          if (minIdx === maxIdx) {
            onSelect(lineOrder[minIdx])
          } else {
            onSelect(lineOrder[minIdx], lineOrder[maxIdx])
          }
        }
      }
      cancelDrag()
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        cancelDrag()
      }
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.userSelect = ''
    }
  }, [isDragging, indexMap, lineOrder, onSelect, cancelDrag])

  return { handleDragStart, handleDragEnter, selectedLines, isDragging }
}
