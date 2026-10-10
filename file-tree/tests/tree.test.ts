import { describe, expect, test, tier } from 'claude-code/testing'

import { flatten, fold, foldersTo, isInside, matches, parentOf, relative, searchRows, sortEntries } from '../hooks/tree'

tier('user')

const f = (name: string, kind = 'file') => ({ name, kind, size: 0, mtimeMs: 1, isLink: false })

describe('paths', () => {
  test('parent, relative and inside', async () => {
    expect(parentOf('/repo/src/app.ts')).toBe('/repo/src')
    expect(parentOf('/repo')).toBe('/')
    expect(relative('/repo', '/repo/src/app.ts')).toBe('src/app.ts')
    expect(isInside('/repo', '/repo/src')).toBe(true)
    expect(isInside('/repo', '/repository')).toBe(false)
  })
})

describe('sortEntries', () => {
  test('folders first, by name ignoring case, hidden and ignored left out', async () => {
    const sorted = sortEntries([f('b.ts'), f('src', 'dir'), f('A.md'), f('.git', 'dir'), f('node_modules', 'dir'), f('dist', 'dir'), f('sock', 'other')], new Set(['dist']), false)
    expect(sorted.map(e => e.name)).toEqual(['src', 'A.md', 'b.ts'])
  })

  test('keeps ignored entries flagged when asked', async () => {
    const sorted = sortEntries([f('dist', 'dir'), f('a.ts')], new Set(['dist']), true)
    expect(sorted).toEqual([
      { name: 'dist', kind: 'dir', mtimeMs: 1, isIgnored: true },
      { name: 'a.ts', kind: 'file', mtimeMs: 1, isIgnored: false },
    ])
  })
})

describe('flatten', () => {
  const listing = {
    '/repo': [{ name: 'src', kind: 'dir' as const, mtimeMs: 1, isIgnored: false }, { name: 'README.md', kind: 'file' as const, mtimeMs: 2, isIgnored: false }],
    '/repo/src': [{ name: 'app.ts', kind: 'file' as const, mtimeMs: 3, isIgnored: false }],
  }

  test('shows the children of open folders only', async () => {
    expect(flatten('/repo', listing, []).map(r => r.path)).toEqual(['/repo/src', '/repo/README.md'])
    const rows = flatten('/repo', listing, ['/repo/src'])
    expect(rows.map(r => [r.path, r.depth, r.isOpen])).toEqual([
      ['/repo/src', 0, true],
      ['/repo/src/app.ts', 1, false],
      ['/repo/README.md', 0, false],
    ])
  })

  test('foldersTo lists the folders to open to show a path', async () => {
    expect(foldersTo('/repo', '/repo/src/lib/a.ts')).toEqual(['/repo/src', '/repo/src/lib'])
    expect(foldersTo('/repo', '/repo/a.ts')).toEqual([])
    expect(foldersTo('/repo', '/elsewhere/a.ts')).toEqual([])
  })
})

describe('search', () => {
  test('fold drops case and diacritics', async () => {
    expect(fold('Đổi Tên.md')).toBe('doi ten.md')
    expect(matches('docs/Ý tưởng.md', 'y tuong')).toBe(true)
    expect(matches('src/app.ts', 'app lib')).toBe(false)
  })

  test('searchRows builds an opened tree of the matches', async () => {
    const rows = searchRows('/repo', ['src/app.ts', 'src/lib/apple.ts', 'README.md'], 'app')
    expect(rows.map(r => [r.name, r.depth, r.kind])).toEqual([
      ['src', 0, 'dir'],
      ['lib', 1, 'dir'],
      ['apple.ts', 2, 'file'],
      ['app.ts', 1, 'file'],
    ])
  })
})
