import { describe, expect, test, tier } from 'claude-code/testing'

import { parseNumstat, parseStatus, rollUp, withNumstat } from '../hooks/git'

tier('user')

const STATUS = [
  '# branch.oid 0123456789abcdef',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +2 -1',
  '1 .M N... 100644 100644 100644 aaa bbb src/app.ts',
  '1 A. N... 000000 100644 100644 000 ccc src/new file.ts',
  '1 .D N... 100644 100644 000000 ddd ddd old.ts',
  '2 R. N... 100644 100644 100644 eee eee R100 src/renamed.ts',
  'src/before.ts',
  'u UU N... 100644 100644 100644 100644 f1 f2 f3 conflict.ts',
  '? notes/',
  '? todo.md',
  '',
].join('\0')

describe('parseStatus', () => {
  test('reads the branch and each file', async () => {
    const snap = parseStatus(STATUS, '/repo')
    expect([snap.branch, snap.upstream, snap.ahead, snap.behind]).toEqual(['main', 'origin/main', 2, 1])
    expect(snap.files).toEqual({
      '/repo/src/app.ts': { status: 'M' },
      '/repo/src/new file.ts': { status: 'A' },
      '/repo/old.ts': { status: 'D' },
      '/repo/src/renamed.ts': { status: 'R' },
      '/repo/conflict.ts': { status: '!' },
      '/repo/notes': { status: 'U' },
      '/repo/todo.md': { status: 'U' },
    })
  })
})

describe('numstat', () => {
  test('reads line counts, renames and binaries', async () => {
    const out = ['12\t3\tsrc/app.ts', '-\t-\tlogo.png', '1\t1\t', 'src/before.ts', 'src/renamed.ts', ''].join('\0')
    expect(parseNumstat(out, '/repo')).toEqual({
      '/repo/src/app.ts': { added: 12, removed: 3 },
      '/repo/logo.png': { added: 0, removed: 0 },
      '/repo/src/renamed.ts': { added: 1, removed: 1 },
    })
  })

  test('withNumstat adds the counts to the files', async () => {
    const snap = withNumstat(parseStatus(STATUS, '/repo'), { '/repo/src/app.ts': { added: 12, removed: 3 } })
    expect(snap.files['/repo/src/app.ts']).toEqual({ status: 'M', added: 12, removed: 3 })
  })
})

describe('rollUp', () => {
  test('counts changed files in every folder up to the root', async () => {
    const counts = rollUp(parseStatus(STATUS, '/repo').files, '/repo')
    expect(counts['/repo/src']).toEqual({ M: 2, U: 1, D: 0 })
    expect(counts['/repo']).toEqual({ M: 3, U: 3, D: 1 })
  })
})
