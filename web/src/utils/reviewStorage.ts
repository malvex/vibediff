interface ProjectReviewState {
  projectPath: string
  lastAccessed: number  // timestamp for LRU eviction
  reviewedFiles: {
    [filePath: string]: string  // hash of file diff content
  }
}

interface ReviewedFilesStorage {
  version: 1
  projects: ProjectReviewState[]
}

const STORAGE_KEY = 'reviewedFilesV2'
const MAX_PROJECTS = 20

/**
 * Load reviewed files for a specific project
 */
export function loadReviewedFiles(projectPath: string): Map<string, string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      // Try to migrate from old format
      migrateOldFormat()
      // Try loading again after migration
      const newStored = localStorage.getItem(STORAGE_KEY)
      if (!newStored) {
        return new Map()
      }
      return loadReviewedFiles(projectPath)  // Recursive call after migration
    }

    const data = JSON.parse(stored) as ReviewedFilesStorage
    const project = data.projects.find(p => p.projectPath === projectPath)

    if (!project) {
      return new Map()
    }

    // Update last accessed time
    project.lastAccessed = Date.now()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))

    return new Map(Object.entries(project.reviewedFiles))
  } catch (error) {
    console.error('Failed to load reviewed files:', error)
    return new Map()
  }
}

/**
 * Save reviewed files for a specific project
 */
export function saveReviewedFiles(projectPath: string, files: Map<string, string>): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    let data: ReviewedFilesStorage

    if (!stored) {
      data = { version: 1, projects: [] }
    } else {
      data = JSON.parse(stored) as ReviewedFilesStorage
    }

    // Find or create project entry
    let project = data.projects.find(p => p.projectPath === projectPath)

    if (!project) {
      project = {
        projectPath,
        lastAccessed: Date.now(),
        reviewedFiles: {}
      }
      data.projects.push(project)
    }

    // Update project data
    project.lastAccessed = Date.now()
    project.reviewedFiles = Object.fromEntries(files)

    // LRU eviction: keep only the most recent MAX_PROJECTS
    if (data.projects.length > MAX_PROJECTS) {
      data.projects.sort((a, b) => b.lastAccessed - a.lastAccessed)
      data.projects = data.projects.slice(0, MAX_PROJECTS)
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (error) {
    console.error('Failed to save reviewed files:', error)
  }
}

/**
 * Migrate old format (Set<string>) to new format with hashes
 */
export function migrateOldFormat(): void {
  try {
    const oldKey = 'reviewedFiles'
    const oldData = localStorage.getItem(oldKey)

    if (!oldData) {
      return  // Nothing to migrate
    }

    // Parse old format (array of file paths)
    const oldPaths = JSON.parse(oldData) as string[]

    // Create new format with empty hashes (will force re-review)
    const newData: ReviewedFilesStorage = {
      version: 1,
      projects: [{
        projectPath: 'default',  // Old format had no project concept
        lastAccessed: Date.now(),
        reviewedFiles: Object.fromEntries(
          oldPaths.map(path => [path, ''])  // Empty hash forces re-review
        )
      }]
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(newData))
    // Keep old data for now (don't remove it in case of issues)
  } catch (error) {
    console.error('Failed to migrate old reviewed files format:', error)
  }
}
