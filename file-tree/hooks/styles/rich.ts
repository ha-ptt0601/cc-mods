import { iconOf } from '../icons'
import { age, nameSeg, titleRow } from '../segments'
import type { RowInput, Seg, Style } from '../segments'

/**
 * The rich style's right column: line counts, `new`, `deleted`, folder
 * counts, or the entry's age.
 */
function detail(r: RowInput, now: number): Seg[] {
  if (r.kind === 'dir') {
    const c = r.counts
    const parts = c ? [c.M ? `M:${c.M}` : '', c.U ? `?:${c.U}` : '', c.D ? `D:${c.D}` : ''].filter(Boolean) : []

    return parts.length ? [{ t: parts.join(' '), dim: true }] : r.mtimeMs ? [{ t: age(r.mtimeMs, now), dim: true }] : []
  }
  const git = r.git
  if (git?.status === 'U' || git?.status === 'A') return [{ t: 'new', c: 'success' }]
  if (git?.status === 'D') return [{ t: 'deleted', c: 'error' }]
  if (git && (git.added || git.removed)) return [{ t: `+${git.added ?? 0}`, c: 'success' }, { t: ' ' }, { t: `-${git.removed ?? 0}`, c: 'error' }]

  return [{ t: age(r.mtimeMs, now), dim: true }]
}

export const rich: Style = {
  row(r, ctx) {
    const icon = iconOf(r.name, r.kind, r.isOpen, ctx.icons)
    const left: Seg[] = [
      { t: '  '.repeat(r.depth) },
      { t: r.kind === 'dir' ? (r.isOpen ? '▾ ' : '▸ ') : '  ', c: 'suggestion' },
      ...(icon ? [{ t: `${icon.glyph} `, ...(icon.color ? { c: icon.color } : { dim: true }) }] : []),
      nameSeg(r, true),
    ]

    return { id: r.path, left, right: detail(r, ctx.now) }
  },

  header(h) {
    const title = titleRow(h, [{ t: h.name, b: true, c: 'claude' }])
    const status: Seg[] = h.status ? [{ t: '● ', c: 'claude' }, { t: h.status, dim: true }] : [{ t: 'Claude is idle', dim: true }]

    return [title, { id: '', left: status, right: [] }]
  },
}
