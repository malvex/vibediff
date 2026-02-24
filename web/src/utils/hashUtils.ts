import type { FileDiff } from '../types/diff'

/**
 * Compute a hash from a file's diff content.
 * Uses the hunks to generate a stable hash that changes when file content changes.
 * Returns a base64-encoded string (first 32 chars for storage efficiency).
 */
export function computeFileHash(file: FileDiff): string {
  try {
    // Create a stable representation of the file's hunks
    const hunkData = file.hunks.map(hunk => ({
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      // Include line content to detect actual changes
      lines: hunk.lines.map(line => ({
        type: line.type,
        content: line.content
      }))
    }))

    // Serialize and encode
    const jsonString = JSON.stringify(hunkData)
    const hash = btoa(encodeURIComponent(jsonString).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    ))

    // Return first 32 chars for reasonable uniqueness while keeping storage compact
    return hash.slice(0, 32)
  } catch (error) {
    console.error('Failed to compute file hash:', error)
    // Return empty string on error (will force re-review)
    return ''
  }
}
