import { describe, expect, test, tier } from 'claude-code/testing'

import { TONES, sweepColor } from '../hooks/rows.client'
import type { RowInput, Seg } from '../hooks/segments'
import { STYLES } from '../hooks/styles'

tier('user')

const text = (segs: Seg[]) => segs.map(s => s.t).join('')
const ctx = { icons: 'unicode' as const, now: 3 * 3600_000 }
const file: RowInput = { path: '/repo/src/app.ts', name: 'app.ts', depth: 1, kind: 'file', isOpen: false, isIgnored: false, mtimeMs: 0 }
const dir: RowInput = { path: '/repo/src', name: 'src', depth: 0, kind: 'dir', isOpen: true, isIgnored: false, mtimeMs: 0 }

describe('ide', () => {
  test('guides, arrow, name and the git letter', async () => {
    const spec = STYLES.ide.row({ ...file, git: { status: 'M', added: 2, removed: 1 } }, ctx)
    expect(spec.id).toBe('/repo/src/app.ts')
    expect(text(spec.left)).toContain('│ ')
    expect(text(spec.left)).toContain('app.ts')
    expect(text(spec.right)).toBe('M')
    expect(text(STYLES.ide.row(dir, ctx).left)).toContain('▾')
  })

  test('a live mark sweeps the name', async () => {
    const spec = STYLES.ide.row({ ...file, mark: { path: file.path, kind: 'write', isLive: true, until: 0 } }, ctx)
    expect(spec.left.find(s => s.t === 'app.ts')).toMatchObject({ tone: 'write', sweep: true })
  })
})

describe('minimal', () => {
  test('a dot for git, a slash after folders, no icons', async () => {
    expect(text(STYLES.minimal.row({ ...file, git: { status: 'U' } }, ctx).right)).toBe('•')
    expect(text(STYLES.minimal.row(dir, ctx).left)).toContain('src/')
  })

  test('a live mark blinks instead of sweeping', async () => {
    const spec = STYLES.minimal.row({ ...file, mark: { path: file.path, kind: 'read', isLive: true, until: 0 } }, ctx)
    expect(spec.left.find(s => s.t === 'app.ts')).toMatchObject({ tone: 'read' })
    expect(spec.left.find(s => s.t === 'app.ts')?.sweep).toBeUndefined()
    expect(spec.right.some(s => s.blink)).toBe(true)
  })
})

describe('rich', () => {
  test('line counts, folder counts and ages', async () => {
    expect(text(STYLES.rich.row({ ...file, git: { status: 'M', added: 12, removed: 3 } }, ctx).right)).toBe('+12 -3')
    expect(text(STYLES.rich.row({ ...file, git: { status: 'U' } }, ctx).right)).toBe('new')
    expect(text(STYLES.rich.row({ ...dir, counts: { M: 2, U: 1, D: 0 } }, ctx).right)).toBe('M:2 ?:1')
    expect(text(STYLES.rich.row(file, ctx).right)).toBe('3h')
  })

  test('the header carries the status line', async () => {
    const lines = STYLES.rich.header({ name: 'repo', git: null, dirty: false, status: 'Claude is editing a.ts' }, ctx)
    expect(lines.map(l => text(l.left)).join('\n')).toContain('Claude is editing a.ts')
  })
})

describe('headers', () => {
  test('every style shows the name and the branch', async () => {
    const git = { branch: 'main', upstream: 'origin/main', ahead: 2, behind: 0, files: {} }
    for (const style of Object.values(STYLES)) {
      const [first] = style.header({ name: 'repo', git, dirty: true, status: '' }, ctx)
      expect(text(first?.left ?? [])).toContain('repo')
      expect(text(first?.right ?? [])).toContain('main')
    }
  })
})

describe('sweepColor', () => {
  test('the band is brightest at its center and moves with the phase', async () => {
    const palette = TONES.write
    const at = (i: number, phase: number) => palette.indexOf(sweepColor(i, phase, 10, palette))
    const lit = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => at(i, 5))
    const brightest = lit.indexOf(Math.max(...lit))
    expect(Math.max(...lit)).toBe(palette.length - 1)
    const later = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => at(i, 7))
    expect(later.indexOf(Math.max(...later))).toBeGreaterThan(brightest)
  })
})
