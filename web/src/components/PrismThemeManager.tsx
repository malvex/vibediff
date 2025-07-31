import { useEffect } from 'react'

export default function PrismThemeManager(): null {
  useEffect(() => {
    // Function to update theme
    const updateTheme = (): void => {
      const isDark = document.documentElement.classList.contains('dark')
      const themeId = 'prism-theme'

      // Remove existing theme
      const existingTheme = document.getElementById(themeId)
      if (existingTheme) {
        existingTheme.remove()
      }

      // Add new theme
      const link = document.createElement('link')
      link.id = themeId
      link.rel = 'stylesheet'
      link.href = isDark
        ? '/themes/prism-tomorrow.css'
        : '/themes/prism.css'

      document.head.appendChild(link)
    }

    // Initial theme
    updateTheme()

    // Watch for class changes on html element
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          updateTheme()
        }
      })
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })

    return () => {
      observer.disconnect()
    }
  }, [])

  return null
}
