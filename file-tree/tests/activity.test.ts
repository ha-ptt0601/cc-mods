import { describe, expect, test, tier } from 'claude-code/testing'

import { FADE_MS, endMarks, isCommit, pruneMarks, startMarks, statusLine, targetOf } from '../hooks/activity'

tier('user')

describe('targetOf', () => {
  test('maps each file tool to a path and a kind', async () => {
    expect(targetOf({ tool: 'Read', file_path: '/repo/a.ts' }, '/repo')).toEqual({ kind: 'read', path: '/repo/a.ts' })
    expect(targetOf({ tool: 'Grep', pattern: 'x', path: 'src/' }, '/repo')).toEqual({ kind: 'read', path: '/repo/src' })
    expect(targetOf({ tool: 'Glob', pattern: '*.ts' }, '/repo')).toEqual({ kind: 'read', path: '/repo' })
    expect(targetOf({ tool: 'Edit', file_path: '/repo/a.ts' }, '/repo')).toEqual({ kind: 'write', path: '/repo/a.ts' })
    expect(targetOf({ tool: 'Write', file_path: './b.ts' }, '/repo')).toEqual({ kind: 'write', path: '/repo/b.ts' })
    expect(targetOf({ tool: 'NotebookEdit', notebook_path: '/repo/n.ipynb' }, '/repo')).toEqual({ kind: 'write', path: '/repo/n.ipynb' })
    expect(targetOf({ tool: 'Bash', command: 'ls' }, '/repo')).toBeNull()
    expect(targetOf({ tool: 'Read' }, '/repo')).toBeNull()
  })
})

describe('isCommit', () => {
  test('finds git commit in a command line', async () => {
    expect(isCommit('git commit -m "x"')).toBe(true)
    expect(isCommit('git add a && git commit -q -m x')).toBe(true)
    expect(isCommit('git -C /repo commit -m x')).toBe(true)
    expect(isCommit('git log --oneline')).toBe(false)
    expect(isCommit('echo git commit')).toBe(false)
  })
})

describe('marks', () => {
  test('live while the tool runs, then fading, then gone', async () => {
    let marks = startMarks([], ['/repo/a.ts'], 'write')
    expect(marks).toEqual([{ path: '/repo/a.ts', kind: 'write', isLive: true, until: 0 }])
    marks = endMarks(marks, ['/repo/a.ts'], 1000)
    expect(marks).toEqual([{ path: '/repo/a.ts', kind: 'write', isLive: false, until: 1000 + FADE_MS }])
    expect(pruneMarks(marks, 1000 + FADE_MS - 1)).toHaveLength(1)
    expect(pruneMarks(marks, 1000 + FADE_MS)).toHaveLength(0)
  })

  test('a new mark on a path replaces the old one', async () => {
    const marks = startMarks(startMarks([], ['/repo/a.ts'], 'read'), ['/repo/a.ts'], 'write')
    expect(marks).toEqual([{ path: '/repo/a.ts', kind: 'write', isLive: true, until: 0 }])
  })

  test('statusLine names the newest live mark', async () => {
    const marks = startMarks(startMarks([], ['/repo/a.ts'], 'read'), ['/repo/src/b.ts'], 'write')
    expect(statusLine(marks, '/repo')).toBe('Claude is editing src/b.ts')
    expect(statusLine([], '/repo')).toBe('')
  })
})
