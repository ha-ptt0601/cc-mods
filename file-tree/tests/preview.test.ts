import { describe, expect, test, tier } from 'claude-code/testing'

import { MAX_CHARS, clip, isBinary, isMarkdown, maxTop, openArgv, splitWords, windowOf } from '../hooks/preview'

tier('user')

describe('preview text', () => {
  test('markdown and binary checks', async () => {
    expect(isMarkdown('/repo/README.md')).toBe(true)
    expect(isMarkdown('/repo/a.MDX')).toBe(true)
    expect(isMarkdown('/repo/a.ts')).toBe(false)
    expect(isBinary('ab\u0000c')).toBe(true)
    expect(isBinary('plain')).toBe(false)
  })

  test('clip keeps whole lines under the limit', async () => {
    expect(clip('a\nb')).toEqual({ text: 'a\nb', note: '' })
    const long = `${'x'.repeat(MAX_CHARS - 5)}\n${'y'.repeat(20)}`
    expect(clip(long)).toEqual({ text: 'x'.repeat(MAX_CHARS - 5), note: 'first 1 lines' })
  })

  test('windowOf shows rows from top, clamped', async () => {
    const text = ['1', '2', '3', '4', '5'].join('\n')
    expect(windowOf(text, 1, 2)).toEqual({ source: '2\n3', startLine: 2 })
    expect(windowOf(text, 9, 2)).toEqual({ source: '4\n5', startLine: 4 })
    expect(maxTop(text, 2)).toBe(3)
  })
})

describe('open with', () => {
  test('splits words, keeping quoted ones whole', async () => {
    expect(splitWords('code -g "{path}"')).toEqual(['code', '-g', '{path}'])
    expect(splitWords("open -a 'Sublime Text'")).toEqual(['open', '-a', 'Sublime Text'])
  })

  test('fills {path} and {dir}, or puts the path last', async () => {
    expect(openArgv('code -g {path}', '/repo/a.ts', 'darwin')).toEqual(['code', '-g', '/repo/a.ts'])
    expect(openArgv('zed', '/repo/a.ts', 'darwin')).toEqual(['zed', '/repo/a.ts'])
    expect(openArgv('term --cwd {dir}', '/repo/src/a.ts', 'linux')).toEqual(['term', '--cwd', '/repo/src', '/repo/src/a.ts'])
  })

  test('empty uses the default app', async () => {
    expect(openArgv('', '/repo/a.ts', 'darwin')).toEqual(['open', '--', '/repo/a.ts'])
    expect(openArgv(' ', '/repo/a.ts', 'linux')).toEqual(['xdg-open', '/repo/a.ts'])
  })
})
