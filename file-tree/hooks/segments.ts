import type { Counts, FileGit, GitSnapshot, GitStatus } from './git'
import type { Kind, Mark } from './activity'
import type { TreeRow } from './tree'

/** One run of text in a row: color (a theme key or hex), and how it lights. */
export type Seg = {
  t: string
  c?: string
  b?: boolean
  dim?: boolean
  /** Claude's activity tone; with `sweep` a light band runs across the text. */
  tone?: Kind
  sweep?: boolean
  /** Shown on alternate animation frames. */
  blink?: boolean
}

/** One drawn row: `id` is the path a click reports ('' for no click). */
export type RowSpec = { id: string; left: Seg[]; right: Seg[] }

/** What a style draws a row from. */
export type RowInput = TreeRow & { git?: FileGit; counts?: Counts; mark?: Mark }

/** What a style draws the header from. */
export type HeaderInput = { name: string; git: GitSnapshot | null; dirty: boolean; status: string }

export type StyleCtx = { icons: 'nerd' | 'unicode'; now: number }

export type Style = {
  row: (r: RowInput, ctx: StyleCtx) => RowSpec
  header: (h: HeaderInput, ctx: StyleCtx) => RowSpec[]
}

/** Theme keys per git status, so colors follow the person's theme. */
export const GIT_COLOR: Record<GitStatus, string> = { M: 'warning', A: 'success', U: 'success', D: 'error', R: 'suggestion', '!': 'error' }

/**
 * The status a folder shows: the first of modified, untracked, deleted it holds.
 */
export function folderStatus(counts: Counts | undefined): GitStatus | undefined {
  if (!counts) return undefined
  if (counts.M > 0) return 'M'
  if (counts.U > 0) return 'U'

  return counts.D > 0 ? 'D' : undefined
}

/**
 * The row's name segment: dim when ignored, colored by git, lit by a mark
 * (sweeping while live when `sweep` is asked for, tinted while fading).
 */
export function nameSeg(r: RowInput, sweep: boolean, base: Seg = { t: '' }): Seg {
  const status = r.kind === 'dir' ? folderStatus(r.counts) : r.git?.status
  const seg: Seg = { ...base, t: r.name, ...(status ? { c: GIT_COLOR[status] } : {}), ...(r.isIgnored ? { dim: true } : {}) }
  if (!r.mark) return seg

  return { ...seg, tone: r.mark.kind, ...(r.mark.isLive && sweep ? { sweep: true } : {}) }
}

/**
 * How long ago `ms` was, in the largest whole unit: `5m`, `3h`, `2d`, `4w`.
 */
export function age(ms: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - ms) / 60000))
  if (minutes < 60) return `${minutes}m`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`
  if (minutes < 60 * 24 * 14) return `${Math.round(minutes / 60 / 24)}d`

  return `${Math.round(minutes / 60 / 24 / 7)}w`
}

/**
 * The header's first line, shared by the styles: the root's name on the
 * left, branch, ahead/behind and a dot for uncommitted changes on the right.
 */
export function titleRow(h: HeaderInput, title: Seg[]): RowSpec {
  const right: Seg[] = h.git
    ? [
        { t: h.git.branch || '(detached)', c: 'suggestion' },
        ...(h.git.ahead ? [{ t: ` ↑${h.git.ahead}`, dim: true }] : []),
        ...(h.git.behind ? [{ t: ` ↓${h.git.behind}`, dim: true }] : []),
        ...(h.dirty ? [{ t: ' ●', c: 'warning' }] : []),
      ]
    : []

  return { id: '', left: title, right }
}
