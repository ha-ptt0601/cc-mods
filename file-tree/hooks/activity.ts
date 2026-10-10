import type { Kind, Mark } from '../types'
import { join, relative } from './tree'

export type { Kind, Mark }

/** How long a mark stays tinted after its tool call ended. */
export const FADE_MS = 4000

const READ_KEYS: Record<string, string> = { Read: 'file_path', Grep: 'path', Glob: 'path' }
const WRITE_KEYS: Record<string, string> = { Edit: 'file_path', Write: 'file_path', NotebookEdit: 'notebook_path' }

/**
 * `path` made absolute against `cwd`, without a trailing slash.
 */
export function absolute(cwd: string, path: string): string {
  const full = path.startsWith('/') ? path : join(cwd, path.replace(/^\.\//, ''))

  return full.replace(/\/+$/, '') || '/'
}

/**
 * The file or folder a tool call reads or writes, or null for any other tool.
 * Grep and Glob with no path search the working directory.
 */
export function targetOf(input: { tool: string } & Record<string, unknown>, cwd: string): { kind: Kind; path: string } | null {
  const readKey = READ_KEYS[input.tool]
  const writeKey = WRITE_KEYS[input.tool]
  const key = readKey ?? writeKey
  if (!key) return null
  const raw = input[key]
  const path = typeof raw === 'string' && raw !== '' ? raw : input.tool === 'Grep' || input.tool === 'Glob' ? cwd : ''
  if (!path) return null

  return { kind: writeKey ? 'write' : 'read', path: absolute(cwd, path) }
}

/**
 * Whether a shell command line runs `git commit` (as a command, not as text).
 */
export function isCommit(command: string): boolean {
  return /(^|[;&|(]\s*)git(\s+-C\s+\S+)*\s+commit(\s|$)/.test(command)
}

/**
 * The marks with a live one on each of `paths`, replacing marks on them.
 */
export function startMarks(marks: readonly Mark[], paths: readonly string[], kind: Kind): Mark[] {
  return [...marks.filter(m => !paths.includes(m.path)), ...paths.map(path => ({ path, kind, isLive: true, until: 0 }))]
}

/**
 * The marks with those on `paths` turned to fading, until `now + FADE_MS`.
 */
export function endMarks(marks: readonly Mark[], paths: readonly string[], now: number): Mark[] {
  return marks.map(m => (m.isLive && paths.includes(m.path) ? { ...m, isLive: false, until: now + FADE_MS } : m))
}

/**
 * The marks still showing at `now`.
 */
export function pruneMarks(marks: readonly Mark[], now: number): Mark[] {
  return marks.filter(m => m.isLive || m.until > now)
}

const VERB: Record<Kind, string> = { read: 'reading', write: 'editing', commit: 'committing' }

/**
 * The rich style's header line: what Claude is doing to which file now, or ''.
 */
export function statusLine(marks: readonly Mark[], root: string): string {
  const live = marks.filter(m => m.isLive).at(-1)

  return live ? `Claude is ${VERB[live.kind]} ${relative(root, live.path) || '.'}` : ''
}
