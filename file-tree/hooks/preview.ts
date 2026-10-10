import { parentOf } from './tree'

/** The most text one preview holds (the Code element draws 100000 at most). */
export const MAX_CHARS = 90_000

/** Files larger than this are not read (`$.fs.read` refuses over 4 MiB). */
export const MAX_BYTES = 4_000_000

/**
 * Whether the file is drawn as Markdown rather than as code.
 */
export function isMarkdown(path: string): boolean {
  return /\.(md|mdx|markdown)$/i.test(path)
}

/**
 * Whether text holds a NUL byte: a binary file, not shown.
 */
export function isBinary(text: string): boolean {
  return text.includes('\u0000')
}

/**
 * Text cut to whole lines under MAX_CHARS, with a note when cut.
 */
export function clip(text: string): { text: string; note: string } {
  if (text.length <= MAX_CHARS) return { text, note: '' }
  const cut = text.slice(0, MAX_CHARS)
  const end = cut.lastIndexOf('\n')
  const kept = end > 0 ? cut.slice(0, end) : cut

  return { text: kept, note: `first ${kept.split('\n').length} lines` }
}

/**
 * The highest first line a window of `rows` can start at.
 */
export function maxTop(text: string, rows: number): number {
  return Math.max(0, text.split('\n').length - rows)
}

/**
 * The `rows` lines from line `top` (0-based, clamped), and the 1-based number
 * of the first.
 */
export function windowOf(text: string, top: number, rows: number): { source: string; startLine: number } {
  const lines = text.split('\n')
  const from = Math.max(0, Math.min(top, lines.length - rows))

  return { source: lines.slice(from, from + rows).join('\n'), startLine: from + 1 }
}

/**
 * A command line split on spaces, single or double quotes keeping a word whole.
 */
export function splitWords(command: string): string[] {
  return [...command.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(m => m[1] ?? m[2] ?? m[3] ?? '')
}

/**
 * What the ↗ button runs: the Open with command with `{path}` and `{dir}`
 * filled (the path last when it holds no `{path}`), or the platform's opener.
 */
export function openArgv(setting: string, path: string, os: 'darwin' | 'linux' | 'win32'): string[] {
  if (!setting.trim()) {
    if (os === 'darwin') return ['open', '--', path]

    return os === 'win32' ? ['cmd', '/c', 'start', '', path] : ['xdg-open', path]
  }
  const words = splitWords(setting)
  const argv = words.map(w => w.replaceAll('{path}', path).replaceAll('{dir}', parentOf(path)))

  return words.some(w => w.includes('{path}')) ? argv : [...argv, path]
}
