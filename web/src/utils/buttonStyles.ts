/**
 * Utility functions for consistent button styling across the app
 */

type ButtonVariant = 'left' | 'right' | 'middle' | 'single'

/**
 * Get button class names based on active state and variant
 */
export function getButtonClassName(isActive: boolean, variant: ButtonVariant = 'single'): string {
  const baseClasses = 'px-3 py-1 text-xs font-medium border cursor-pointer leading-5 transition-colors'

  const roundedClasses: Record<ButtonVariant, string> = {
    left: 'rounded-l-md',
    right: 'rounded-r-md border-l-0',
    middle: 'border-l-0',
    single: 'rounded-md'
  }

  const stateClasses = isActive
    ? 'bg-accent text-accent-fg border-accent'
    : 'bg-surface-inset text-fg-muted border-edge hover:bg-edge hover:text-fg'

  return `${baseClasses} ${roundedClasses[variant]} ${stateClasses}`
}

/**
 * Get icon button class names (for buttons with only icons)
 */
export function getIconButtonClassName(isActive: boolean): string {
  const baseClasses = 'p-2 text-sm border rounded-md cursor-pointer transition-colors'

  const stateClasses = isActive
    ? 'bg-accent text-accent-fg border-accent'
    : 'bg-surface-inset text-fg-subtle border-edge hover:bg-edge hover:text-fg'

  return `${baseClasses} ${stateClasses}`
}
