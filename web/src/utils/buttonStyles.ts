/**
 * Utility functions for consistent button styling across the app
 */

type ButtonVariant = 'left' | 'right' | 'middle' | 'single'

/**
 * Get button class names based on active state and variant
 * @param isActive - Whether the button is in active/selected state
 * @param variant - Button position variant for border radius
 * @returns Complete className string for the button
 */
export function getButtonClassName(isActive: boolean, variant: ButtonVariant = 'single'): string {
  const baseClasses = 'px-4 py-[5px] text-sm font-medium border cursor-pointer leading-5 transition-colors'

  const roundedClasses: Record<ButtonVariant, string> = {
    left: 'rounded-l-md',
    right: 'rounded-r-md border-l-0',
    middle: 'border-l-0',
    single: 'rounded-md'
  }

  const stateClasses = isActive
    ? 'bg-[#0366d6] dark:bg-[#1f6feb] text-white border-[#0366d6] dark:border-[#1f6feb]'
    : 'bg-[#fafbfc] dark:bg-[#21262d] text-[#24292e] dark:text-[#c9d1d9] border-[rgba(27,31,35,.15)] dark:border-[#30363d] hover:bg-[#f3f4f6] dark:hover:bg-[#30363d]'

  return `${baseClasses} ${roundedClasses[variant]} ${stateClasses}`
}

/**
 * Get icon button class names (for buttons with only icons)
 * @param isActive - Whether the button is in active/selected state
 * @returns Complete className string for the icon button
 */
export function getIconButtonClassName(isActive: boolean): string {
  const baseClasses = 'p-2 text-sm border rounded-md cursor-pointer transition-colors'

  const stateClasses = isActive
    ? 'bg-[#0366d6] dark:bg-[#1f6feb] text-white border-[#0366d6] dark:border-[#1f6feb]'
    : 'bg-[#fafbfc] dark:bg-[#21262d] text-[#586069] dark:text-[#8b949e] border-[rgba(27,31,35,.15)] dark:border-[#30363d] hover:bg-[#f3f4f6] dark:hover:bg-[#30363d] hover:text-[#24292e] dark:hover:text-[#c9d1d9]'

  return `${baseClasses} ${stateClasses}`
}
