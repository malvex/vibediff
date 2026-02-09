import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useComments } from './useComments'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('useComments - getCommentRangeLines', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: return empty comments on initial fetch
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    })
  })

  it('returns empty set when there are no comments', () => {
    const { result } = renderHook(() => useComments())
    const lineOrder = [1, 2, 3, 4, 5]

    const rangeLines = result.current.getCommentRangeLines('file.ts', lineOrder)
    expect(rangeLines.size).toBe(0)
  })

  it('highlights single-line comments', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: '1', file: 'file.ts', line: 3, lineEnd: 3, content: 'single line', createdAt: new Date().toISOString() }
      ],
    })

    const { result } = renderHook(() => useComments())
    // Wait for effect to run
    await vi.waitFor(() => {
      expect(result.current.comments.length).toBe(1)
    })

    const lineOrder = [1, 2, 3, 4, 5]
    const rangeLines = result.current.getCommentRangeLines('file.ts', lineOrder)
    expect(rangeLines).toEqual(new Set([3]))
  })

  it('returns lines covered by a range comment', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: '1', file: 'file.ts', line: 2, lineEnd: 4, content: 'range comment', createdAt: new Date().toISOString() }
      ],
    })

    const { result } = renderHook(() => useComments())
    await vi.waitFor(() => {
      expect(result.current.comments.length).toBe(1)
    })

    const lineOrder = [1, 2, 3, 4, 5]
    const rangeLines = result.current.getCommentRangeLines('file.ts', lineOrder)
    expect(rangeLines).toEqual(new Set([2, 3, 4]))
  })

  it('handles non-contiguous line orders (with negative numbers for deletions)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: '1', file: 'file.ts', line: -10, lineEnd: 5, content: 'range', createdAt: new Date().toISOString() }
      ],
    })

    const { result } = renderHook(() => useComments())
    await vi.waitFor(() => {
      expect(result.current.comments.length).toBe(1)
    })

    const lineOrder = [-10, -11, 5, 6, 7]
    const rangeLines = result.current.getCommentRangeLines('file.ts', lineOrder)
    expect(rangeLines).toEqual(new Set([-10, -11, 5]))
  })

  it('ignores range comments for different files', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: '1', file: 'other.ts', line: 2, lineEnd: 4, content: 'range', createdAt: new Date().toISOString() }
      ],
    })

    const { result } = renderHook(() => useComments())
    await vi.waitFor(() => {
      expect(result.current.comments.length).toBe(1)
    })

    const lineOrder = [1, 2, 3, 4, 5]
    const rangeLines = result.current.getCommentRangeLines('file.ts', lineOrder)
    expect(rangeLines.size).toBe(0)
  })

  it('highlights comments where lineEnd equals line as single-line', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: '1', file: 'file.ts', line: 3, lineEnd: 3, content: 'same line', createdAt: new Date().toISOString() }
      ],
    })

    const { result } = renderHook(() => useComments())
    await vi.waitFor(() => {
      expect(result.current.comments.length).toBe(1)
    })

    const lineOrder = [1, 2, 3, 4, 5]
    const rangeLines = result.current.getCommentRangeLines('file.ts', lineOrder)
    expect(rangeLines).toEqual(new Set([3]))
  })

  it('handles multiple range comments merging their ranges', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: '1', file: 'file.ts', line: 1, lineEnd: 3, content: 'first range', createdAt: new Date().toISOString() },
        { id: '2', file: 'file.ts', line: 4, lineEnd: 5, content: 'second range', createdAt: new Date().toISOString() }
      ],
    })

    const { result } = renderHook(() => useComments())
    await vi.waitFor(() => {
      expect(result.current.comments.length).toBe(2)
    })

    const lineOrder = [1, 2, 3, 4, 5]
    const rangeLines = result.current.getCommentRangeLines('file.ts', lineOrder)
    expect(rangeLines).toEqual(new Set([1, 2, 3, 4, 5]))
  })

  it('skips range comments where line numbers are not found in lineOrder', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: '1', file: 'file.ts', line: 99, lineEnd: 100, content: 'out of range', createdAt: new Date().toISOString() }
      ],
    })

    const { result } = renderHook(() => useComments())
    await vi.waitFor(() => {
      expect(result.current.comments.length).toBe(1)
    })

    const lineOrder = [1, 2, 3, 4, 5]
    const rangeLines = result.current.getCommentRangeLines('file.ts', lineOrder)
    expect(rangeLines.size).toBe(0)
  })
})
