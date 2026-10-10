import { isInside, join, parentOf } from './tree'

export type GitStatus = 'M' | 'A' | 'U' | 'D' | 'R' | '!'
export type FileGit = { status: GitStatus; added?: number; removed?: number }
export type Counts = { M: number; U: number; D: number }
export type GitSnapshot = {
  branch: string
  upstream: string
  ahead: number
  behind: number
  files: Record<string, FileGit>
}

/**
 * A file's status from porcelain v2's `XY`: deleted, added, else modified.
 */
function xyStatus(xy: string): GitStatus {
  if (xy.includes('D')) return 'D'
  if (xy.startsWith('A')) return 'A'

  return 'M'
}

/**
 * Reads `git status --porcelain=v2 --branch -z`: the branch line facts and a
 * status per changed path, keyed by absolute path under `top`.
 */
export function parseStatus(out: string, top: string): GitSnapshot {
  const snap: GitSnapshot = { branch: '', upstream: '', ahead: 0, behind: 0, files: {} }
  const fields = out.split('\0')
  const put = (path: string, status: GitStatus) => {
    snap.files[join(top, path.replace(/\/+$/, ''))] = { status }
  }
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i] ?? ''
    if (field.startsWith('# branch.head ')) snap.branch = field.slice('# branch.head '.length)
    else if (field.startsWith('# branch.upstream ')) snap.upstream = field.slice('# branch.upstream '.length)
    else if (field.startsWith('# branch.ab ')) {
      const [ahead, behind] = field.slice('# branch.ab '.length).split(' ')
      snap.ahead = Math.abs(Number(ahead) || 0)
      snap.behind = Math.abs(Number(behind) || 0)
    } else if (field.startsWith('1 ')) put(field.split(' ').slice(8).join(' '), xyStatus(field.split(' ')[1] ?? ''))
    else if (field.startsWith('2 ')) {
      put(field.split(' ').slice(9).join(' '), 'R')
      i++
    } else if (field.startsWith('u ')) put(field.split(' ').slice(10).join(' '), '!')
    else if (field.startsWith('? ')) put(field.slice(2), 'U')
  }

  return snap
}

/**
 * Reads `git diff --numstat -z HEAD`: added and removed lines per path, keyed
 * by absolute path under `top`; a binary file counts as 0 and 0.
 */
export function parseNumstat(out: string, top: string): Record<string, { added: number; removed: number }> {
  const stats: Record<string, { added: number; removed: number }> = {}
  const fields = out.split('\0')
  for (let i = 0; i < fields.length; i++) {
    const m = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(fields[i] ?? '')
    if (!m) continue
    let path = m[3] ?? ''
    if (path === '') {
      path = fields[i + 2] ?? ''
      i += 2
    }
    stats[join(top, path)] = { added: Number(m[1]) || 0, removed: Number(m[2]) || 0 }
  }

  return stats
}

/**
 * The snapshot with each file's line counts filled in.
 */
export function withNumstat(snap: GitSnapshot, stats: Record<string, { added: number; removed: number }>): GitSnapshot {
  const files: Record<string, FileGit> = {}
  for (const [path, git] of Object.entries(snap.files)) files[path] = { ...git, ...(stats[path] ?? {}) }

  return { ...snap, files }
}

/**
 * Per folder under `root` (itself included), how many changed files it holds:
 * modified (renamed and conflicted too), untracked or added, deleted.
 */
export function rollUp(files: Record<string, FileGit>, root: string): Record<string, Counts> {
  const counts: Record<string, Counts> = {}
  for (const [path, git] of Object.entries(files)) {
    if (!isInside(root, path) || path === root) continue
    const bucket: keyof Counts = git.status === 'U' || git.status === 'A' ? 'U' : git.status === 'D' ? 'D' : 'M'
    for (let dir = parentOf(path); isInside(root, dir); dir = parentOf(dir)) {
      const c = (counts[dir] ??= { M: 0, U: 0, D: 0 })
      c[bucket]++
      if (dir === root) break
    }
  }

  return counts
}
