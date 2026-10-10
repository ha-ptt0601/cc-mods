import type { On } from 'claude-code'
import { describe, expect, test, tier } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

tier('user')

const BAND = {
  plugin: 'file-tree',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 80, scroll: { offset: 0, bodyRows: 3 }, view: {} },
  viewport: { columns: 80, rows: 24 },
} as const

const PANE = {
  plugin: 'file-tree',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'file-tree',
  props: { title: 'Files', isFocused: true, bodyColumns: 48, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  viewport: { columns: 120, rows: 40 },
} as const

const entry = (name: string, kind: 'file' | 'dir') => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })
const ran = (exitCode: number, stdout = '') => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
const TREE = { command: 'tree', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as const

/**
 * Mocks the engine under a small folder that is not a git repository, and
 * opens the tree on it.
 */
async function setUp($: Engine, on: On) {
  on('session.cwd', async () => ({ value: '/repo' }))
  on('clock.now', async () => ({ value: 0 }))
  on('process.run', async (_, e) => (e.argv[0] === 'find' ? ran(0, '/repo/src/deep/match.ts\n/repo/README.md\n') : ran(128)))
  on('fs.list', async (_, e) => ({
    value: e.path === '/repo'
      ? [entry('src', 'dir'), entry('README.md', 'file')]
      : e.path === '/repo/src' ? [entry('app.ts', 'file')] : [],
  }))
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  await $.command.run(TREE)
}

/**
 * The paths of the rows the rows region draws.
 */
async function drawnRows(ui: { find: (q: { key: string }) => Promise<{ props: Record<string, unknown> } | undefined> }): Promise<string[]> {
  const rows = (await ui.find({ key: 'rows' }))?.props.props as { rows?: { id: string }[] } | undefined

  return (rows?.rows ?? []).map(r => r.id)
}

describe('band', () => {
  test('draws the Files button above the prompt', async $ => {
    const ui = await $.ui.mount(BAND)
    expect((await ui.find({ key: 'files' }))?.text).toContain('Files')
    await ui.unmount()
  })
})

describe('pane', () => {
  test('lists the root and opens a folder with →', async ($, on) => {
    await setUp($, on)
    const ui = await $.ui.mount(PANE)
    expect(await drawnRows(ui)).toEqual(['/repo/src', '/repo/README.md'])
    await ui.key({ key: 'right', in: 'rows' })
    expect(await drawnRows(ui)).toEqual(['/repo/src', '/repo/src/app.ts', '/repo/README.md'])
    await ui.unmount()
  })

  test('draws the same rows on the desktop surface', async ($, on) => {
    await setUp($, on)
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect(await drawnRows(ui)).toContain('/repo/README.md')
    await ui.unmount()
  })

  test('t cycles the style', async ($, on) => {
    on('store.get', async () => ({ value: undefined }))
    on('store.set', async () => ({ value: undefined }))
    await setUp($, on)
    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'style' }))?.text).toContain('ide')
    await ui.press({ key: 'style' })
    expect((await ui.find({ key: 'style' }))?.text).toContain('minimal')
    await ui.unmount()
  })
})

describe('search', () => {
  test('finds a file in a folder not opened yet', async ($, on) => {
    await setUp($, on)
    const ui = await $.ui.mount(PANE)
    await ui.input({ key: 'search', text: 'match', kind: 'change' })
    expect(await drawnRows(ui)).toEqual(['/repo/src', '/repo/src/deep', '/repo/src/deep/match.ts'])
    await ui.unmount()
  })
})

describe('git', () => {
  test('marks a modified file and shows the branch', async ($, on) => {
    on('session.cwd', async () => ({ value: '/repo' }))
    on('clock.now', async () => ({ value: 0 }))
    on('ui.open', async () => ({ value: { isPlaced: true } }))
    on('fs.list', async (_, e) => ({ value: e.path === '/repo' ? [entry('a.ts', 'file')] : [] }))
    on('process.run', async (_, e) => {
      const args = e.argv.join(' ')
      if (args.includes('rev-parse')) return ran(0, '/repo\n')
      if (args.includes('status')) return ran(0, ['# branch.head main', '1 .M N... 100644 100644 100644 a b a.ts', ''].join('\0'))
      if (args.includes('numstat')) return ran(0, '4\t1\ta.ts\0')

      return ran(1)
    })
    await $.command.run(TREE)
    const ui = await $.ui.mount(PANE)
    const rows = (await ui.find({ key: 'rows' }))?.props.props as { rows: { right: { t: string }[] }[] }
    expect(rows.rows[0]?.right.map(s => s.t).join('')).toBe('M')
    expect(JSON.stringify(await ui.drawn())).toContain('main')
    await ui.unmount()
  })
})

describe('activity', () => {
  test('a Read lights the file and opens its folder', async ($, on) => {
    on('tool.call', async () => ({ result: { type: 'text', file: { filePath: '/repo/src/app.ts', content: '', numLines: 0, startLine: 1, totalLines: 0 } } }))
    await setUp($, on)
    const ui = await $.ui.mount(PANE)
    await $.tool.call({ tool: 'Read', file_path: '/repo/src/app.ts' })
    const rows = (await ui.find({ key: 'rows' }))?.props.props as { rows: { id: string; left: { t: string; tone?: string }[] }[] }
    const app = rows.rows.find(r => r.id === '/repo/src/app.ts')
    expect(app?.left.find(s => s.t === 'app.ts')?.tone).toBe('read')
    await ui.unmount()
  })
})
