import Prism from 'prismjs'

// Import language components
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-scss'
import 'prismjs/components/prism-sass'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-diff'
import 'prismjs/components/prism-markup-templating'
import 'prismjs/components/prism-php'
import 'prismjs/components/prism-ruby'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-csharp'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-swift'
import 'prismjs/components/prism-kotlin'
import 'prismjs/components/prism-scala'
import 'prismjs/components/prism-r'
import 'prismjs/components/prism-perl'
import 'prismjs/components/prism-docker'
import 'prismjs/components/prism-nginx'
import 'prismjs/components/prism-toml'
import 'prismjs/components/prism-ini'
import 'prismjs/components/prism-graphql'
import 'prismjs/components/prism-elixir'
import 'prismjs/components/prism-erlang'
import 'prismjs/components/prism-haskell'
import 'prismjs/components/prism-lua'
import 'prismjs/components/prism-dart'
import 'prismjs/components/prism-powershell'
import 'prismjs/components/prism-vim'
import 'prismjs/components/prism-makefile'
import 'prismjs/components/prism-protobuf'

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
    'scss': 'scss',
    'sass': 'sass',
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
    'cc': 'cpp',
    'cxx': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp',
    'swift': 'swift',
    'kt': 'kotlin',
    'kts': 'kotlin',
    'scala': 'scala',
    'r': 'r',
    'pl': 'perl',
    'dockerfile': 'docker',
    'toml': 'toml',
    'ini': 'ini',
    'graphql': 'graphql',
    'gql': 'graphql',
    'ex': 'elixir',
    'exs': 'elixir',
    'erl': 'erlang',
    'hrl': 'erlang',
    'hs': 'haskell',
    'lua': 'lua',
    'dart': 'dart',
    'ps1': 'powershell',
    'vim': 'vim',
    'makefile': 'makefile',
    'mk': 'makefile',
    'proto': 'protobuf',
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
