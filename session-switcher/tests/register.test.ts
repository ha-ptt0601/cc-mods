import { describe, expect, test, tier } from 'claude-code/testing'

import { ago, promptText } from '../hooks/register'

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

describe('ago', () => {
  test('picks the largest whole unit', async () => {
    const now = 10 * 24 * 3600_000
    expect(ago(now - 5 * 60_000, now)).toBe('5m')
    expect(ago(now - 3 * 3600_000, now)).toBe('3h')
    expect(ago(now - 2 * 24 * 3600_000, now)).toBe('2d')
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
