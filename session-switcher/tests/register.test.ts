import { describe, expect, test, tier } from 'claude-code/testing'

import { ago, countLabel, matches, projectDir, promptText, sessionTitle, worktreePaths } from '../hooks/register'

tier('user')

describe('promptText', () => {
  test('reads a typed prompt, string or blocks', async () => {
    expect(promptText('{"type":"user","message":{"content":"liệt kê file"}}')).toBe('liệt kê file')
    expect(promptText('{"type":"user","message":{"content":[{"type":"text","text":"hi  there"}]}}')).toBe('hi there')
  })

  test('skips command output, meta rows and broken lines', async () => {
    expect(promptText('{"type":"user","message":{"content":"<command-name>/meter</command-name>"}}')).toBe('')
    expect(promptText('{"type":"user","isMeta":true,"message":{"content":"x"}}')).toBe('')
    expect(promptText('{"type":"assistant","message":{"content":"x"}}')).toBe('')
    expect(promptText('not json')).toBe('')
  })
})

describe('sessionTitle', () => {
  const custom = '{"type":"custom-title","customTitle":"Fix login bug"}'
  const ai = '{"type":"ai-title","aiTitle":"review pr"}'
  const command = '{"type":"user","message":{"content":"<command-name>/review-pr</command-name>"}}'
  const typed = '{"type":"user","message":{"content":"fix the bug"}}'

  test('prefers the custom title, then the AI title, then the first prompt', async () => {
    expect(sessionTitle([ai, custom], [typed])).toBe('Fix login bug')
    expect(sessionTitle([ai], [typed])).toBe('review pr')
    expect(sessionTitle([], [command, typed])).toBe('fix the bug')
  })

  test('keeps a titled session started by a slash command, drops an empty one', async () => {
    expect(sessionTitle([custom], [command])).toBe('Fix login bug')
    expect(sessionTitle([], [command])).toBe('')
  })
})

describe('ago', () => {
  test('picks the largest whole unit', async () => {
    const now = 10 * 24 * 3600_000
    expect(ago(now - 5 * 60_000, now)).toBe('5m')
    expect(ago(now - 3 * 3600_000, now)).toBe('3h')
    expect(ago(now - 2 * 24 * 3600_000, now)).toBe('2d')
  })
})

describe('worktreePaths', () => {
  test('reads every worktree, the main one first', async () => {
    const porcelain = [
      'worktree /Users/me/work/api', 'HEAD abc', 'branch refs/heads/main', '',
      'worktree /Users/me/work/api/.claude/worktrees/fix-1', 'HEAD def', 'branch refs/heads/fix-1', '',
    ].join('\n')
    expect(worktreePaths(porcelain)).toEqual(['/Users/me/work/api', '/Users/me/work/api/.claude/worktrees/fix-1'])
    expect(worktreePaths('')).toEqual([])
  })
})

describe('projectDir', () => {
  test('names the transcripts folder like Claude Code does', async () => {
    expect(projectDir('/Users/me', '/Users/me/work/api/.claude/worktrees/fix-1'))
      .toBe('/Users/me/.claude/projects/-Users-me-work-api--claude-worktrees-fix-1')
  })
})

describe('matches', () => {
  const row = { title: 'Ý tưởng cho trang Settings', worktree: 'feat-search' }

  test('finds every word in the title or worktree, ignoring case and diacritics', async () => {
    expect(matches(row, '')).toBe(true)
    expect(matches(row, 'settings')).toBe(true)
    expect(matches(row, 'y tuong')).toBe(true)
    expect(matches(row, 'tưởng SETTINGS')).toBe(true)
    expect(matches(row, 'feat-search')).toBe(true)
    expect(matches(row, 'billing')).toBe(false)
    expect(matches({ title: 'Đổi tên' }, 'doi')).toBe(true)
  })
})

describe('countLabel', () => {
  test('counts every session, or the matches while searching', async () => {
    expect(countLabel(12, 12, '')).toBe('12 sessions')
    expect(countLabel(1, 1, '  ')).toBe('1 session')
    expect(countLabel(3, 12, 'login')).toBe('3 / 12')
  })
})

describe('pane', () => {
  test('draws a search field that filters the list', async ($, on) => {
    on('session.id', async () => ({ value: 'current' }))
    on('clock.now', async () => ({ value: 0 }))
    const ui = await $.ui.mount({
      plugin: 'session-switcher',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'sessions',
      props: { title: 'Sessions', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
      viewport: { columns: 120, rows: 30 },
    })
    expect(await ui.find({ key: 'search' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '0 sessions' })).toBeDefined()
    await ui.input({ key: 'search', text: 'nothing like this', kind: 'change' })
    expect(await ui.find({ type: 'Text', text: /No session matches/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('rows', () => {
  test('numbers each other session and tags its worktree', async ($, on) => {
    on('session.id', async () => ({ value: 'current' }))
    on('clock.now', async () => ({ value: 0 }))
    const rows = [
      { id: 'current', title: 'Fix login bug', mtimeMs: 0 },
      { id: 'a', title: 'Add a search field', mtimeMs: 0, worktree: 'feat-search' },
    ]
    on('state.get', async (_, e, next) => (e.key === 'sessions' ? { value: { value: rows, version: 1 } } : next(e)))
    const ui = await $.ui.mount({
      plugin: 'session-switcher',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'sessions',
      props: { title: 'Sessions', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
      viewport: { columns: 120, rows: 30 },
    })
    expect((await ui.find({ key: 'a' }))?.text).toContain('Add a search field')
    expect(await ui.find({ type: 'Text', text: '[feat-search] ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '(this session)' })).toBeDefined()
    await ui.unmount()
  })
})

describe('band', () => {
  test('draws the Sessions button above the prompt', async $ => {
    const ui = await $.ui.mount({
      plugin: 'session-switcher',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 80, scroll: { offset: 0, bodyRows: 3 }, view: {} },
      viewport: { columns: 80, rows: 24 },
    })
    expect((await ui.find({ key: 'toggle' }))?.text).toContain('Sessions')
    await ui.unmount()
  })
})
