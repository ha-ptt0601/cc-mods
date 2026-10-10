import { describe, expect, test, tier } from 'claude-code/testing'

tier('user')

const BAND = {
  plugin: 'file-tree',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 80, scroll: { offset: 0, bodyRows: 3 }, view: {} },
  viewport: { columns: 80, rows: 24 },
} as const

describe('band', () => {
  test('draws the Files button above the prompt', async $ => {
    const ui = await $.ui.mount(BAND)
    expect((await ui.find({ key: 'files' }))?.text).toContain('Files')
    await ui.unmount()
  })
})
