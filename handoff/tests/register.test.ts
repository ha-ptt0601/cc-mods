import { describe, expect, mock, test, tier } from 'claude-code/testing'

import { condense, formatAge, formatTokens, header, injection, slug, tokensOf, writerOf } from '../hooks/register'

tier('user')

describe('handoff file', () => {
  const text = header('abc-1', '2026-01-01T00:00:00.000Z', 420000) + 'Goal: fix login\n'

  test('reads the writer and token count back from the header', async () => {
    expect(writerOf(text)).toBe('abc-1')
    expect(tokensOf(text)).toBe(420000)
    expect(writerOf('no header')).toBeUndefined()
    expect(tokensOf('no header')).toBe(0)
  })

  test('injects the note without its header and names the file', async () => {
    const injected = injection('/tmp/x.md', text)
    expect(injected).toContain('Goal: fix login')
    expect(injected).toContain('/tmp/x.md')
    expect(injected).not.toContain('session=abc-1')
  })

  test('cuts a long note and says so', async () => {
    expect(injection('/tmp/x.md', 'a'.repeat(20000))).toContain('[cut, read the file for the rest]')
  })
})

describe('formatting', () => {
  test('makes a branch or path safe as a file name', async () => {
    expect(slug('/Users/me/work/api')).toBe('Users_me_work_api')
    expect(slug('feat/login-fix')).toBe('feat_login-fix')
    expect(slug('///')).toBe('default')
  })

  test('shortens tokens and ages', async () => {
    expect(formatTokens(420400)).toBe('420k')
    expect(formatTokens(900)).toBe('900')
    expect(formatAge(5 * 60_000)).toBe('5m')
    expect(formatAge(3 * 3_600_000)).toBe('3h')
    expect(formatAge(72 * 3_600_000)).toBe('3d')
  })
})

describe('loading the handoff at session start', () => {
  const NOTE = 'Goal: fix login'
  const NOW = 1_800_000_000_000

  const world = (on: any, options: { hasFile?: boolean; mtimeMs?: number; writer?: string } = {}) => {
    const { hasFile = true, mtimeMs = NOW - 60_000, writer = 'writer-session' } = options
    mock.clock(on, { now: NOW })
    mock.store(on, {})
    on('env.get', () => ({ value: '/Users/me' }))
    on('process.run', () => ({ value: { exitCode: 0, stdout: '/Users/me/work/api/.git\nfeat/login\n', stderr: '' } }))
    on('fs.exists', () => ({ value: hasFile }))
    on('fs.stat', () => ({ value: { mtimeMs } }))
    on('fs.read', () => ({ value: header(writer, 'then', 420000) + NOTE + '\n' }))
    on('classic.SessionStart', () => ({}))
  }

  const injected = (result: { additionalContext?: readonly string[] }) => (result.additionalContext ?? []).join('\n')

  test('a new session reads the note without being asked', async ($, on) => {
    world(on)
    expect(injected(await $.classic.SessionStart({ source: 'startup' }))).toContain(NOTE)
  })

  test('/clear in the session that wrote it reads the note', async ($, on) => {
    world(on, { writer: 'test-session' })
    expect(injected(await $.classic.SessionStart({ source: 'clear', session_id: 'test-session' }))).toContain(NOTE)
  })

  test('resuming another session reads the note', async ($, on) => {
    world(on)
    expect(injected(await $.classic.SessionStart({ source: 'resume', session_id: 'other' }))).toContain(NOTE)
  })

  test('resuming the writer skips it, since that session still holds the context', async ($, on) => {
    world(on)
    expect(injected(await $.classic.SessionStart({ source: 'resume', session_id: 'writer-session' }))).toBe('')
  })

  test('the same note is read once', async ($, on) => {
    world(on)
    expect(injected(await $.classic.SessionStart({ source: 'startup' }))).toContain(NOTE)
    expect(injected(await $.classic.SessionStart({ source: 'startup' }))).toBe('')
  })

  test('a note older than two weeks is left out', async ($, on) => {
    world(on, { mtimeMs: NOW - 15 * 24 * 60 * 60 * 1000 })
    expect(injected(await $.classic.SessionStart({ source: 'startup' }))).toBe('')
  })

  test('compaction and a missing file add nothing', async ($, on) => {
    world(on, { hasFile: false })
    expect(injected(await $.classic.SessionStart({ source: 'startup' }))).toBe('')
    expect(injected(await $.classic.SessionStart({ source: 'compact' }))).toBe('')
  })
})

describe('condense', () => {
  test('keeps the newest rows when the transcript is too long', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ role: 'user', text: `row-${i} `.padEnd(1900, 'x') }))
    const text = condense(rows)
    expect(text).toContain('row-99 ')
    expect(text).not.toContain('row-0 ')
  })

  test('names tools and drops empty rows', async () => {
    expect(condense([{ role: 'assistant', text: '', toolUses: [{ tool: 'Bash' }] }, { role: 'user', text: '' }])).toBe('assistant:  [tools: Bash]')
  })
})
