import { GIT_COLOR, folderStatus, nameSeg, titleRow } from '../segments'
import type { Seg, Style } from '../segments'

export const minimal: Style = {
  row(r) {
    const status = r.kind === 'dir' ? folderStatus(r.counts) : r.git?.status
    const name = nameSeg({ ...r, name: r.kind === 'dir' ? `${r.name}/` : r.name }, false, { t: '', dim: !status && !r.mark })
    const right: Seg[] = [
      ...(r.mark?.isLive ? [{ t: '• ', tone: r.mark.kind, blink: true }] : []),
      ...(status ? [{ t: '•', c: GIT_COLOR[status] }] : []),
    ]

    return { id: r.path, left: [{ t: '  '.repeat(r.depth + 1) }, name], right }
  },

  header(h) {
    return [titleRow(h, [{ t: h.name, b: true }])]
  },
}
