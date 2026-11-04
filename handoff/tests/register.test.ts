import { describe, expect, mock, test, tier } from 'claude-code/testing'

import { branchOf, condense, formatAge, formatTokens, handoffLabel, header, injection, isOwnFile, noteFile, noteLabel, pick, slug, titleFrom, tokensOf, writerOf } from '../hooks/register'

tier('user')

describe('handoff file', () => {
  const text = header('abc-1', '2026-01-01T00:00:00.000Z', 'feat/login', 420000) + 'Goal: fix login\n'

  test('reads the writer and token count back from the header', async () => {
    expect(writerOf(text)).toBe('abc-1')
    expect(tokensOf(text)).toBe(420000)
    expect(writerOf('no header')).toBeUndefined()
    expect(tokensOf('no header')).toBe(0)
    expect(branchOf({ name: 'x.md', text })).toBe('feat/login')
    expect(branchOf({ name: 'feat_login.md', text: 'no header' })).toBe('feat_login')
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

describe('naming a note after its session', () => {
  test('uses the title and the start of the session id', async () => {
    expect(noteFile('Fix login bug', 'abcdef12-3456')).toBe('Fix_login_bug--abcdef12.md')
    expect(noteFile('Sửa lỗi đăng nhập', 'abcdef12-3456')).toBe('Sửa_lỗi_đăng_nhập--abcdef12.md')
    expect(noteFile('x'.repeat(200), 'abcdef12').length).toBe(60 + '--abcdef12.md'.length)
  })

  test('two sessions with one title get two files', async () => {
    expect(noteFile('Fix login', 'aaaaaaaa-1')).not.toBe(noteFile('Fix login', 'bbbbbbbb-1'))
  })

  test('recognises its own file after a retitle', async () => {
    expect(isOwnFile('Old_title--abcdef12.md', 'abcdef12-3456')).toBe(true)
    expect(isOwnFile('Old_title--99999999.md', 'abcdef12-3456')).toBe(false)
    expect(isOwnFile('feat_login.md', 'abcdef12-3456')).toBe(false)
  })

  test('prefers the custom title over the AI title', async () => {
    const ai = '{"type":"ai-title","aiTitle":"review pr"}'
    const custom = '{"type":"custom-title","customTitle":"Fix login bug"}'
    expect(titleFrom([ai, custom])).toBe('Fix login bug')
    expect(titleFrom([ai, 'broken'])).toBe('review pr')
    expect(titleFrom([])).toBeUndefined()
  })
})

describe('what the band says about the note', () => {
  const NOW = 10 * 3_600_000
  const twoHoursAgo = NOW - 2 * 3_600_000

  test('names a note without its id', async () => {
    expect(noteLabel('Fix_login_bug--abcdef12.md')).toBe('Fix login bug')
    expect(noteLabel('feat_login.md')).toBe('feat login')
  })

  test('a reopened session names the note it just loaded', async () => {
    expect(handoffLabel(null, { name: 'Fix_login--abcdef12.md', savedAt: twoHoursAgo, isLoaded: true }, NOW)).toBe('loaded handoff "Fix login" from 2h ago')
  })

  test("a session's own note comes first", async () => {
    const own = { path: '/d/Mine--abcdef12.md', savedAt: twoHoursAgo, tokens: 1 }
    expect(handoffLabel(own, { name: 'Other--11111111.md', savedAt: 0, isLoaded: true }, NOW)).toBe('handoff "Mine" saved 2h ago')
  })

  test('says when there is nothing', async () => {
    expect(handoffLabel(null, null, NOW)).toBe('handoff not saved')
  })
})

describe('pick', () => {
  const note = (name: string, branch: string) => ({ name, path: `/d/${name}`, mtimeMs: 1, text: header('s', 'then', branch, 1) })

  test('takes the first note on the branch and only names the rest', async () => {
    const notes = [note('other.md', 'main'), note('mine.md', 'feat/login'), note('older.md', 'feat/login')]
    const { note: chosen, others } = pick(notes, 'feat/login')
    expect(chosen?.name).toBe('mine.md')
    expect(others).toEqual(['other.md', 'older.md'])
  })

  test('reads nothing from another branch', async () => {
    expect(pick([note('other.md', 'main')], 'feat/login').note).toBeUndefined()
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

  const world = (on: any, options: { hasFile?: boolean; mtimeMs?: number; writer?: string; branch?: string; files?: unknown[] } = {}) => {
    const { hasFile = true, mtimeMs = NOW - 60_000, writer = 'writer-session', branch = 'feat/login', files } = options
    mock.clock(on, { now: NOW })
    mock.store(on, {})
    on('env.get', () => ({ value: '/Users/me' }))
    on('process.run', () => ({ value: { exitCode: 0, stdout: `/Users/me/work/api/.git\n${branch}\n`, stderr: '' } }))
    on('fs.exists', () => ({ value: hasFile }))
    on('fs.list', () => ({ value: files ?? [{ name: 'Fix_login--aaaaaaaa.md', kind: 'file', size: 10, mtimeMs, isLink: false }] }))
    on('fs.read', () => ({ value: header(writer, 'then', 'feat/login', 420000) + NOTE + '\n' }))
    on('ui.toast', () => ({ value: undefined }))
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

  test('resuming another session leaves the note for the next empty session', async ($, on) => {
    world(on)
    expect(injected(await $.classic.SessionStart({ source: 'resume', session_id: 'other' }))).toBe('')
    expect(injected(await $.classic.SessionStart({ source: 'startup' }))).toContain(NOTE)
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

  test('an older note on the branch does not surface after the newest was read', async ($, on) => {
    world(on, {
      files: [
        { name: 'Newest--aaaaaaaa.md', kind: 'file', size: 10, mtimeMs: NOW - 60_000, isLink: false },
        { name: 'Older--bbbbbbbb.md', kind: 'file', size: 10, mtimeMs: NOW - 120_000, isLink: false },
      ],
    })
    const first = injected(await $.classic.SessionStart({ source: 'startup' }))
    expect(first).toContain('Newest--aaaaaaaa.md')
    expect(first).toContain('Other handoff notes in the same folder, unread: Older--bbbbbbbb.md')
    expect(injected(await $.classic.SessionStart({ source: 'startup' }))).toBe('')
  })

  test('the band learns which note was loaded', async ($, on) => {
    world(on)
    const writes: Record<string, unknown> = {}
    on('state.set', ($: unknown, e: { key: string; value: unknown }) => {
      writes[e.key] = e.value
      return { isSet: true, version: 1 }
    })
    await $.classic.SessionStart({ source: 'startup' })
    expect(writes.previous).toEqual({ name: 'Fix_login--aaaaaaaa.md', savedAt: NOW - 60_000, isLoaded: true })
  })

  test('a note older than two weeks is left out', async ($, on) => {
    world(on, { mtimeMs: NOW - 15 * 24 * 60 * 60 * 1000 })
    expect(injected(await $.classic.SessionStart({ source: 'startup' }))).toBe('')
  })

  test('a note from another branch is not read', async ($, on) => {
    world(on, { branch: 'main' })
    expect(injected(await $.classic.SessionStart({ source: 'startup' }))).toBe('')
  })

  test('compaction and a missing file add nothing', async ($, on) => {
    world(on, { hasFile: false })
    expect(injected(await $.classic.SessionStart({ source: 'startup' }))).toBe('')
    expect(injected(await $.classic.SessionStart({ source: 'compact' }))).toBe('')
  })
})

describe('saving from a session that was just resumed', () => {
  const answered = { isAnswered: true, text: 'Goal: fix login', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }

  const world = (on: any, rows: unknown[]) => {
    const asked: { model?: string; prompt: string }[] = []
    const written: string[] = []
    mock.clock(on)
    mock.store(on, {})
    on('env.get', () => ({ value: '/Users/me' }))
    on('process.run', () => ({ value: { exitCode: 0, stdout: '/Users/me/work/api/.git\nfeat/login\n', stderr: '' } }))
    on('fs.exists', () => ({ value: false }))
    on('fs.write', ($: unknown, e: { path: string; text: string }) => {
      written.push(`${e.path}\n${e.text}`)
      return { value: undefined }
    })
    on('model.fork', () => ({ value: { isAnswered: false, reason: 'nothing-to-fork' } }))
    on('model.complete', ($: unknown, e: { model?: string; prompt: string }) => {
      asked.push(e)
      return { value: answered }
    })
    on('session.messages', () => ({ value: rows }))
    on('session.cwd', () => ({ value: '/Users/me/work/api' }))
    on('session.id', () => ({ value: 'test-session' }))
    on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 320000, window: 1000000 }, rateLimits: [] } }))
    return { asked, written }
  }

  test('writes the note from the loaded transcript', async ($, on) => {
    const { asked, written } = world(on, [{ role: 'user', text: 'fix the login bug', toolUses: [] }])
    const { text } = await $.command.run({ command: 'handoff', args: '' })
    expect(text).toContain('Handoff saved')
    expect(asked[0].prompt).toContain('fix the login bug')
    expect(written[0]).toContain('Goal: fix login')
    expect(written[0]).toContain('/.claude/handoffs/Users_me_work_api/fix_the_login_bug--test-ses.md')
    expect(written[0]).toContain('branch=feat/login')
  })

  test('an empty conversation saves nothing and says why', async ($, on) => {
    const { asked, written } = world(on, [])
    const { text } = await $.command.run({ command: 'handoff', args: '' })
    expect(text).toContain('Nothing to hand off yet')
    expect(asked.length).toBe(0)
    expect(written.length).toBe(0)
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
