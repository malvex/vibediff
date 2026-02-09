import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRangeSelection } from './useRangeSelection'

describe('useRangeSelection', () => {
  const lineOrder = [1, 2, 3, 4, 5]
  let onSelect: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onSelect = vi.fn()
  })

  it('starts with empty selection and not dragging', () => {
    const { result } = renderHook(() =>
      useRangeSelection({ lineOrder, onSelect })
    )

    expect(result.current.selectedLines.size).toBe(0)
    expect(result.current.isDragging).toBe(false)
  })

  it('selects a single line on drag start', () => {
    const { result } = renderHook(() =>
      useRangeSelection({ lineOrder, onSelect })
    )

    act(() => {
      result.current.handleDragStart(3)
    })

    expect(result.current.isDragging).toBe(true)
    expect(result.current.selectedLines).toEqual(new Set([3]))
  })

  it('expands selection when dragging to another line', () => {
    const { result } = renderHook(() =>
      useRangeSelection({ lineOrder, onSelect })
    )

    act(() => {
      result.current.handleDragStart(2)
    })

    act(() => {
      result.current.handleDragEnter(4)
    })

    expect(result.current.selectedLines).toEqual(new Set([2, 3, 4]))
  })

  it('expands selection when dragging backwards', () => {
    const { result } = renderHook(() =>
      useRangeSelection({ lineOrder, onSelect })
    )

    act(() => {
      result.current.handleDragStart(4)
    })

    act(() => {
      result.current.handleDragEnter(2)
    })

    expect(result.current.selectedLines).toEqual(new Set([2, 3, 4]))
  })

  it('calls onSelect with single line on mouseup after single-line drag', () => {
    const { result } = renderHook(() =>
      useRangeSelection({ lineOrder, onSelect })
    )

    act(() => {
      result.current.handleDragStart(3)
    })

    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'))
    })

    expect(onSelect).toHaveBeenCalledWith(3, 3)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(result.current.isDragging).toBe(false)
    expect(result.current.selectedLines.size).toBe(0)
  })

  it('calls onSelect with start and end lines on mouseup after multi-line drag', () => {
    const { result } = renderHook(() =>
      useRangeSelection({ lineOrder, onSelect })
    )

    act(() => {
      result.current.handleDragStart(2)
    })

    act(() => {
      result.current.handleDragEnter(4)
    })

    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'))
    })

    expect(onSelect).toHaveBeenCalledWith(2, 4)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(result.current.isDragging).toBe(false)
    expect(result.current.selectedLines.size).toBe(0)
  })

  it('calls onSelect with correct order when dragging backwards', () => {
    const { result } = renderHook(() =>
      useRangeSelection({ lineOrder, onSelect })
    )

    act(() => {
      result.current.handleDragStart(4)
    })

    act(() => {
      result.current.handleDragEnter(2)
    })

    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'))
    })

    expect(onSelect).toHaveBeenCalledWith(2, 4)
  })

  it('cancels drag on Escape key', () => {
    const { result } = renderHook(() =>
      useRangeSelection({ lineOrder, onSelect })
    )

    act(() => {
      result.current.handleDragStart(2)
    })

    act(() => {
      result.current.handleDragEnter(4)
    })

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(onSelect).not.toHaveBeenCalled()
    expect(result.current.isDragging).toBe(false)
    expect(result.current.selectedLines.size).toBe(0)
  })

  it('ignores handleDragEnter when not dragging', () => {
    const { result } = renderHook(() =>
      useRangeSelection({ lineOrder, onSelect })
    )

    act(() => {
      result.current.handleDragEnter(3)
    })

    expect(result.current.selectedLines.size).toBe(0)
    expect(result.current.isDragging).toBe(false)
  })

  it('handles negative line numbers (deletions)', () => {
    const mixedOrder = [-10, -11, 5, 6, 7]
    const { result } = renderHook(() =>
      useRangeSelection({ lineOrder: mixedOrder, onSelect })
    )

    act(() => {
      result.current.handleDragStart(-10)
    })

    act(() => {
      result.current.handleDragEnter(5)
    })

    expect(result.current.selectedLines).toEqual(new Set([-10, -11, 5]))

    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'))
    })

    expect(onSelect).toHaveBeenCalledWith(-10, 5)
  })

  it('updates selection as drag moves through multiple lines', () => {
    const { result } = renderHook(() =>
      useRangeSelection({ lineOrder, onSelect })
    )

    act(() => {
      result.current.handleDragStart(1)
    })

    act(() => {
      result.current.handleDragEnter(3)
    })

    expect(result.current.selectedLines).toEqual(new Set([1, 2, 3]))

    act(() => {
      result.current.handleDragEnter(5)
    })

    expect(result.current.selectedLines).toEqual(new Set([1, 2, 3, 4, 5]))

    // Shrink selection back
    act(() => {
      result.current.handleDragEnter(2)
    })

    expect(result.current.selectedLines).toEqual(new Set([1, 2]))
  })

  it('handleDragEnter works immediately after handleDragStart without re-render gap', () => {
    // This test verifies the stale closure fix:
    // handleDragEnter must work even if called in the same act() as handleDragStart
    const { result } = renderHook(() =>
      useRangeSelection({ lineOrder, onSelect })
    )

    act(() => {
      result.current.handleDragStart(1)
    })

    // Simulate rapid mouse movement - enter immediately after start
    act(() => {
      result.current.handleDragEnter(3)
    })

    // Selection should include lines 1-3, not be empty
    expect(result.current.selectedLines).toEqual(new Set([1, 2, 3]))
  })
})
