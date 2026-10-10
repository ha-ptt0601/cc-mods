type Icon = { glyph: string; color?: string }

const NERD: Record<string, Icon> = {
  ts: { glyph: '', color: '#519aba' },
  tsx: { glyph: '', color: '#519aba' },
  js: { glyph: '', color: '#cbcb41' },
  jsx: { glyph: '', color: '#cbcb41' },
  php: { glyph: '', color: '#a074c4' },
  md: { glyph: '', color: '#519aba' },
  json: { glyph: '', color: '#cbcb41' },
  py: { glyph: '', color: '#4b8bbe' },
  go: { glyph: '', color: '#519aba' },
  rs: { glyph: '', color: '#dea584' },
  html: { glyph: '', color: '#e44d26' },
  css: { glyph: '', color: '#42a5f5' },
  yml: { glyph: '', color: '#a074c4' },
  yaml: { glyph: '', color: '#a074c4' },
  sh: { glyph: '', color: '#89e051' },
}

const UNICODE_COLOR: Record<string, string> = {
  ts: '#519aba', tsx: '#519aba', js: '#cbcb41', jsx: '#cbcb41', php: '#a074c4', md: '#519aba',
  json: '#cbcb41', py: '#4b8bbe', go: '#519aba', rs: '#dea584', html: '#e44d26', css: '#42a5f5',
}

/**
 * The glyph before a name: a folder or a file-type icon (Nerd Font), or a
 * small colored dot for files and nothing for folders (unicode, where the
 * folder's arrow is its mark).
 */
export function iconOf(name: string, kind: 'file' | 'dir', isOpen: boolean, set: 'nerd' | 'unicode'): Icon | undefined {
  const ext = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : ''
  if (set === 'nerd') {
    if (kind === 'dir') return { glyph: isOpen ? '' : '', color: '#89b4fa' }

    return NERD[ext] ?? { glyph: '' }
  }
  if (kind === 'dir') return undefined
  const color = UNICODE_COLOR[ext]

  return color ? { glyph: '•', color } : { glyph: '·' }
}
