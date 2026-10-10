import { describe, expect, test, tier } from 'claude-code/testing'

import { effectiveStyle, nextStyle, settingsOf } from '../hooks/settings'

tier('user')

describe('settingsOf', () => {
  test('reads each option and falls back to the defaults', async () => {
    expect(settingsOf(undefined)).toEqual({
      style: 'ide', layout: 'replace', openWith: '', follow: true, icons: 'unicode', showIgnored: false,
    })
    expect(settingsOf({ style: 'rich', previewLayout: 'split', openWith: 'code -g {path}', followClaude: 'off', icons: 'nerd', showIgnored: 'on' })).toEqual({
      style: 'rich', layout: 'split', openWith: 'code -g {path}', follow: false, icons: 'nerd', showIgnored: true,
    })
    expect(settingsOf({ style: 'neon' }).style).toBe('ide')
  })
})

describe('style override', () => {
  test('cycles ide, minimal, rich', async () => {
    expect(nextStyle('ide')).toBe('minimal')
    expect(nextStyle('minimal')).toBe('rich')
    expect(nextStyle('rich')).toBe('ide')
  })

  test('keeps the button choice until /config changes', async () => {
    expect(effectiveStyle('ide', undefined)).toBe('ide')
    expect(effectiveStyle('ide', { style: 'rich', over: 'ide' })).toBe('rich')
    expect(effectiveStyle('minimal', { style: 'rich', over: 'ide' })).toBe('minimal')
    expect(effectiveStyle('ide', { style: 'neon', over: 'ide' })).toBe('ide')
  })
})
