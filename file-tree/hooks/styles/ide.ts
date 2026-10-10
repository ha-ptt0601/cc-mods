import { iconOf } from '../icons'
import { GIT_COLOR, folderStatus, nameSeg, titleRow } from '../segments'
import type { Seg, Style } from '../segments'

export const ide: Style = {
  row(r, ctx) {
    const icon = iconOf(r.name, r.kind, r.isOpen, ctx.icons)
    const left: Seg[] = [
      { t: '│ '.repeat(r.depth), c: 'subtle' },
      { t: r.kind === 'dir' ? (r.isOpen ? '▾ ' : '▸ ') : '  ', c: 'suggestion' },
      ...(icon ? [{ t: `${icon.glyph} `, ...(icon.color ? { c: icon.color } : { dim: true }) }] : []),
      nameSeg(r, true),
    ]
    const status = r.kind === 'dir' ? folderStatus(r.counts) : r.git?.status

    return { id: r.path, left, right: status ? [{ t: status, c: GIT_COLOR[status] }] : [] }
  },

  header(h) {
    return [titleRow(h, [{ t: h.name, b: true, c: 'claude' }])]
  },
}
