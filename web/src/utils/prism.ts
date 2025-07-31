import Prism from 'prismjs'

// Import language components
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-diff'

export function getLanguageFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''

  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'jsx',
    'ts': 'typescript',
    'tsx': 'tsx',
    'go': 'go',
    'py': 'python',
    'java': 'java',
    'rs': 'rust',
    'css': 'css',
    'scss': 'css',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'md': 'markdown',
    'sh': 'bash',
    'bash': 'bash',
    'html': 'html',
    'xml': 'xml',
    'sql': 'sql',
    'rb': 'ruby',
    'php': 'php',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
  }

  return languageMap[ext] || 'plaintext'
}

// Highlight a string of code
export function highlightCode(code: string, language: string): string {
  if (!(language in Prism.languages)) {
    return Prism.util.encode(code) as string
  }

  return Prism.highlight(code, Prism.languages[language], language)
}
