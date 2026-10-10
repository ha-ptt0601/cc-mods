import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { FADE_MS, endMarks, isCommit, pruneMarks, startMarks, statusLine, targetOf } from './activity'
import { parseNumstat, parseStatus, rollUp, withNumstat } from './git'
import { MAX_BYTES, clip, isBinary, isMarkdown, maxTop, openArgv, windowOf } from './preview'
import type { RowInput, RowSpec, Seg } from './segments'
import { effectiveStyle, isStyle, nextStyle, settingsOf } from './settings'
import type { Settings } from './settings'
import { STYLES } from './styles'
import { flatten, foldersTo, isInside, parentOf, relative, searchRows, sortEntries } from './tree'
import type { Entry, TreeRow } from './tree'

const PANE = 'file-tree'
const STYLE_KEY = 'styleOverride'

const root = atom({ plugin: 'file-tree', key: 'root' } as const, '')
const listing = atom({ plugin: 'file-tree', key: 'listing' } as const, {})
const open = atom({ plugin: 'file-tree', key: 'open' } as const, [])
const cursor = atom({ plugin: 'file-tree', key: 'cursor' } as const, '')
const top = atom({ plugin: 'file-tree', key: 'top' } as const, 0)
const query = atom({ plugin: 'file-tree', key: 'query' } as const, '')
const files = atom({ plugin: 'file-tree', key: 'files' } as const, [])
const marks = atom({ plugin: 'file-tree', key: 'marks' } as const, [])
const git = atom({ plugin: 'file-tree', key: 'git' } as const, null)
const note = atom({ plugin: 'file-tree', key: 'note' } as const, '')
const styleName = atom({ plugin: 'file-tree', key: 'style' } as const, 'ide')
const preview = atom({ plugin: 'file-tree', key: 'preview' } as const, '')
const previewText = atom({ plugin: 'file-tree', key: 'previewText' } as const, '')
const previewNote = atom({ plugin: 'file-tree', key: 'previewNote' } as const, '')
const previewTop = atom({ plugin: 'file-tree', key: 'previewTop' } as const, 0)

let settings: Settings = settingsOf(undefined)
/** Rows the tree had room for at the last drawing, for keeping the cursor in view. */
let room = 20
/** Lines the preview had room for at the last drawing. */
let previewRoom = 20
/** The platform, for the default opener: found on first use. */
let os: 'darwin' | 'linux' | 'win32' | undefined
/** The repository's top folder: undefined until checked, null outside a repo. */
let gitTop: string | null | undefined

/**
 * Lists one folder for the tree, leaving out (or flagging) what git ignores.
 */
async function listDir($: EngineInterface, dir: string): Promise<Entry[]> {
  const raw = await $.fs.list(dir)
  let ignored = new Set<string>()
  if (gitTop && raw.length) {
    const names = raw.map(e => (e.kind === 'dir' ? `${e.name}/` : e.name))
    const run = await $.process.run(['git', '--no-optional-locks', '-C', dir, 'check-ignore', '--', ...names], { timeoutMs: 5000 })
      .catch(() => ({ exitCode: 1, stdout: '' }))
    ignored = new Set(run.stdout.split('\n').filter(Boolean).map(p => p.replace(/\/$/, '').split('/').pop() ?? p))
  }

  return sortEntries(raw, ignored, settings.showIgnored)
}

/**
 * Lists `dirs` again (each one listed before, or asked for), keeping the rest.
 */
async function relist($: EngineInterface, dirs: readonly string[]) {
  const lists = await Promise.all(dirs.map(async dir => [dir, await listDir($, dir).catch(() => null)] as const))
  await update($, listing, all => {
    const next = { ...all }
    for (const [dir, entries] of lists) if (entries) next[dir] = entries

    return next
  })
}

let gitTimer: Timer | null = null

/**
 * Reads git status and line counts for the root's repository into state;
 * outside a repository, clears them.
 */
async function refreshGit($: EngineInterface) {
  if (!gitTop) {
    await update($, git, () => null)

    return
  }
  const base = ['git', '--no-optional-locks', '-C', gitTop]
  const [status, numstat] = await Promise.all([
    $.process.run([...base, 'status', '--porcelain=v2', '--branch', '-z'], { timeoutMs: 8000 }),
    $.process.run([...base, 'diff', '--numstat', '-z', 'HEAD'], { timeoutMs: 8000 }).catch(() => ({ exitCode: 1, stdout: '' })),
  ])
  if (status.exitCode !== 0) return
  const repo = gitTop
  await update($, git, () => withNumstat(parseStatus(status.stdout, repo), parseNumstat(numstat.stdout, repo)))
}

/**
 * Refreshes git once a burst of changes has settled (300 ms).
 */
function scheduleGit($: EngineInterface) {
  gitTimer?.cancel()
  gitTimer = $.clock.after(300, () => {
    void refreshGit($).catch(() => undefined)
  })
}

/**
 * Every file under the root, relative to it, for search: git's list in a
 * repository (tracked and untracked, ignored left out), else `find`.
 */
async function loadFiles($: EngineInterface) {
  const r = await read($, root)
  const run = gitTop
    ? await $.process.run(['git', '-C', r, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { timeoutMs: 10000 })
    : await $.process.run(['find', r, '-maxdepth', '8', '-type', 'f', '-not', '-path', '*/.git/*', '-not', '-path', '*/node_modules/*'], { timeoutMs: 10000 })
  const list = gitTop
    ? run.stdout.split('\0').filter(Boolean)
    : run.stdout.split('\n').filter(Boolean).map(p => relative(r, p))
  await update($, files, () => list.slice(0, 50000))
}

/**
 * Re-roots the tree on the session's working directory: lists its top folder
 * and forgets what was open.
 */
async function reset($: EngineInterface) {
  const cwd = await $.session.cwd()
  const check = await $.process.run(['git', '-C', cwd, 'rev-parse', '--show-toplevel'], { timeoutMs: 5000 })
    .catch(() => ({ exitCode: 1, stdout: '' }))
  gitTop = check.exitCode === 0 ? check.stdout.trim() : null
  await update($, root, () => cwd)
  await update($, listing, () => ({}))
  await update($, open, () => [])
  await update($, cursor, () => '')
  await update($, top, () => 0)
  await update($, query, () => '')
  await update($, files, () => [])
  await refreshGit($).catch(() => undefined)
  await relist($, [cwd])
}

/**
 * Opens or closes a folder, listing it the first time it opens.
 */
async function toggle($: EngineInterface, dir: string) {
  const isOpen = (await read($, open)).includes(dir)
  if (isOpen) {
    await update($, open, list => list.filter(d => d !== dir))

    return
  }
  if (!(await read($, listing))[dir]) await relist($, [dir])
  await update($, open, list => [...list, dir])
}

/**
 * The rows on screen now: the search's, or the tree's.
 */
async function treeRows($: EngineInterface): Promise<TreeRow[]> {
  const r = await read($, root)
  const q = await read($, query)

  return q.trim() ? searchRows(r, await read($, files), q) : flatten(r, await read($, listing), await read($, open))
}

/**
 * Moves the cursor to `path` and scrolls so that it shows.
 */
async function moveTo($: EngineInterface, rows: readonly TreeRow[], path: string) {
  const at = rows.findIndex(row => row.path === path)
  if (at < 0) return
  await update($, cursor, () => path)
  await update($, top, t => (at < t ? at : at >= t + room ? at - room + 1 : t))
  const row = rows[at]
  if (settings.layout === 'split' && (await read($, preview)) && row?.kind === 'file') await showPreview($, row.path).catch(() => undefined)
}

/**
 * Opens the folders down to `path` and, when following Claude, scrolls to it.
 */
async function reveal($: EngineInterface, path: string) {
  const r = await read($, root)
  const dirs = foldersTo(r, path)
  const listed = await read($, listing)
  const missing = dirs.filter(dir => !listed[dir])
  if (missing.length) await relist($, missing)
  await update($, open, list => [...new Set([...list, ...dirs])])
  if (!settings.follow || (await read($, query)).trim()) return
  const rows = await treeRows($)
  const at = rows.findIndex(row => row.path === path)
  if (at >= 0) await update($, top, t => (at < t || at >= t + room ? Math.max(0, at - Math.floor(room / 2)) : t))
}

/**
 * Drops the marks that finished fading.
 */
async function prune($: EngineInterface) {
  const now = await $.clock.now()
  await update($, marks, list => pruneMarks(list, now))
}

/**
 * After a shell command: marks a new commit's files green, and refreshes the
 * open folders and git.
 */
async function afterBash($: EngineInterface, command: string, failed: boolean) {
  const r = await read($, root)
  if (!r) return
  if (!failed && gitTop && isCommit(command)) {
    const run = await $.process.run(['git', '-C', gitTop, 'diff-tree', '--no-commit-id', '--name-only', '-r', '-z', 'HEAD'], { timeoutMs: 5000 })
    const repo = gitTop
    const paths = run.stdout.split('\0').filter(Boolean).map(p => `${repo}/${p}`).filter(p => isInside(r, p))
    const now = await $.clock.now()
    await update($, marks, list => endMarks(startMarks(list, paths, 'commit'), paths, now))
    if (paths[0]) await reveal($, paths[0])
    $.clock.after(FADE_MS + 100, () => void prune($))
  }
  await relist($, [r, ...(await read($, open))])
  scheduleGit($)
}

/**
 * Reads `path` into the preview: refused when outside the root, too large or
 * binary, cut to whole lines when long.
 */
async function showPreview($: EngineInterface, path: string) {
  const r = await read($, root)
  let text = ''
  let why = ''
  if (!isInside(r, path)) why = 'outside the tree'
  else {
    const st = await $.fs.stat(path)
    if (st.size > MAX_BYTES) why = `${Math.round(st.size / 1e6)} MB, too large to preview`
    else {
      const raw = await $.fs.read(path)
      if (isBinary(raw)) why = 'binary file'
      else {
        const cut = clip(raw)
        text = cut.text
        why = cut.note
      }
    }
  }
  await update($, preview, () => path)
  await update($, previewText, () => text)
  await update($, previewNote, () => why)
  await update($, previewTop, () => 0)
}

/**
 * Closes the preview and returns to the tree.
 */
async function closePreview($: EngineInterface) {
  await update($, preview, () => '')
  await update($, previewText, () => '')
}

/**
 * Scrolls the preview by `by` lines, clamped.
 */
async function scrollPreview($: EngineInterface, by: number) {
  const last = maxTop(await read($, previewText), previewRoom)
  await update($, previewTop, t => Math.max(0, Math.min(last, t + by)))
}

/**
 * Opens a file with the Open with command or the default app.
 */
async function openExternal($: EngineInterface, path: string) {
  if (!os) {
    const uname = await $.process.run(['uname', '-s'], { timeoutMs: 3000 }).catch(() => ({ exitCode: 1, stdout: '' }))
    os = uname.exitCode !== 0 ? 'win32' : uname.stdout.trim() === 'Darwin' ? 'darwin' : 'linux'
  }
  const run = await $.process.run(openArgv(settings.openWith, path, os), { timeoutMs: 10000 })
    .catch((error: unknown) => ({ exitCode: 1, stdout: '', stderr: String(error) }))
  if (run.exitCode !== 0) await update($, note, () => `Could not open ${path.split('/').pop()}: ${run.stderr.trim().slice(0, 80)}`)
}

/**
 * Acts on a key the rows region sent: move, open, close, page.
 */
async function onKey($: EngineInterface, key: string) {
  const shown = await read($, preview)
  if (shown && settings.layout === 'replace') {
    const page = Math.max(1, previewRoom - 2)
    const by: Record<string, number> = { up: -1, k: -1, down: 1, j: 1, pageup: -page, pagedown: page, home: -1e9, end: 1e9 }
    if (key === 'left' || key === 'h' || key === 'escape') await closePreview($)
    else if (key in by) await scrollPreview($, by[key] ?? 0)

    return
  }
  if (shown && (key === 'pageup' || key === 'pagedown')) {
    await scrollPreview($, (key === 'pageup' ? -1 : 1) * Math.max(1, previewRoom - 2))

    return
  }
  const rows = await treeRows($)
  const cur = await read($, cursor)
  const at = Math.max(0, rows.findIndex(row => row.path === cur))
  const row = rows[at]
  const go = (delta: number) => {
    const target = rows[Math.max(0, Math.min(rows.length - 1, at + delta))]

    return target ? moveTo($, rows, target.path) : Promise.resolve()
  }
  if (key === 'up' || key === 'k') await go(-1)
  else if (key === 'down' || key === 'j') await go(1)
  else if (key === 'pageup') await go(-room)
  else if (key === 'pagedown') await go(room)
  else if (key === 'home') await go(-rows.length)
  else if (key === 'end') await go(rows.length)
  else if (!row) return
  else if ((key === 'right' || key === 'l') && row.kind === 'dir' && !row.isOpen) await toggle($, row.path)
  else if (key === 'left' || key === 'h') {
    if (row.kind === 'dir' && row.isOpen) await toggle($, row.path)
    else if (parentOf(row.path) !== (await read($, root))) await moveTo($, rows, parentOf(row.path))
  } else if (key === 'return' || key === ' ') {
    if (row.kind === 'dir') await toggle($, row.path)
    else await showPreview($, row.path).catch(error => update($, note, () => `Could not read ${row.name}: ${String(error)}`))
  }
}

/**
 * The rows with their git status, folder counts and Claude's marks.
 */
async function decorate($: EngineInterface, rows: readonly TreeRow[]): Promise<RowInput[]> {
  const snap = await read($, git)
  const counts = snap ? rollUp(snap.files, await read($, root)) : {}
  const live = await read($, marks)

  return rows.map(row => {
    const fileGit = snap?.files[row.path]
    const folder = counts[row.path]
    const mark = live.find(m => m.path === row.path)

    return { ...row, ...(fileGit ? { git: fileGit } : {}), ...(folder ? { counts: folder } : {}), ...(mark ? { mark } : {}) }
  })
}

/**
 * Opens the pane, or brings it forward, with the keyboard on it; lists the
 * working directory the first time or when it changed.
 */
async function show($: EngineInterface): Promise<string> {
  if ((await read($, root)) !== (await $.session.cwd())) await reset($)
  await $.ui.open({ id: PANE, title: 'Files', focus: true, columns: 48 })

  return 'Files: ↑↓ move · → open · ← close · Enter preview · s search · t style · x close'
}

export const register: Register = (on, options) => {
  settings = settingsOf(options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'tree',
      description: 'Open the file tree (close: hide it)',
      argumentHint: '[close]',
    })
    const style = effectiveStyle(settings.style, await $.store.get(STYLE_KEY).catch(() => undefined))
    await update($, styleName, () => style)

    return started
  })

  on('command.run', { command: 'tree' }, async ($, e) => {
    if (/^(close|hide|x)$/i.test(e.args.trim())) {
      await $.ui.close({ id: PANE })

      return { text: 'File tree closed.' }
    }

    return { text: await show($) }
  })

  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    const run = await $.process.run(['git', '-C', e.cwd, 'rev-parse', '--absolute-git-dir'], { timeoutMs: 5000 })
      .catch(() => ({ exitCode: 1, stdout: '' }))
    const dir = run.exitCode === 0 ? run.stdout.trim() : ''

    return dir ? { ...result, watchPaths: [...(result.watchPaths ?? []), `${dir}/index`, `${dir}/HEAD`] } : result
  })

  on('classic.FileChanged', async ($, e, next) => {
    const result = await next(e)
    if (/\/(index|HEAD)$/.test(e.file_path)) scheduleGit($)

    return result
  })

  on('tool.call', async ($, e, next) => {
    let target: { kind: 'read' | 'write' | 'commit'; path: string } | null = null
    try {
      const r = await read($, root)
      const found = r ? targetOf(e as unknown as { tool: string } & Record<string, unknown>, await $.session.cwd()) : null
      if (found && isInside(r, found.path)) {
        target = found
        await update($, marks, list => startMarks(list, [found.path], found.kind))
        await reveal($, found.path)
      }
    } catch {
      target = null
    }
    const result = await next(e)
    try {
      if (target) {
        const done = target
        const now = await $.clock.now()
        await update($, marks, list => endMarks(list, [done.path], now))
        $.clock.after(FADE_MS + 100, () => void prune($))
        if (done.kind === 'write') {
          await relist($, [parentOf(done.path)])
          scheduleGit($)
        }
      }
      if (e.tool === 'Bash') void afterBash($, e.command, Boolean(result.deny || result.isError)).catch(() => undefined)
    } catch {
      // The tree's bookkeeping never changes the tool's result.
    }

    return result
  })

  on('ui.message', async ($, e, next) => {
    if (e.requestId !== PANE || e.element !== 'rows' || !e.data || typeof e.data !== 'object') return next(e)
    const data = e.data as { key?: unknown; press?: unknown; open?: unknown }
    const rows = await treeRows($)
    if (typeof data.key === 'string') await onKey($, data.key)
    else if (typeof data.press === 'string') {
      await moveTo($, rows, data.press)
      const row = rows.find(r => r.path === data.press)
      if (row?.kind === 'dir') await toggle($, row.path)
    } else if (typeof data.open === 'string') {
      const row = rows.find(r => r.path === data.open)
      if (row?.kind === 'file') await showPreview($, row.path).catch(() => undefined)
      else if (row) await toggle($, row.path)
    }

    return {}
  })

  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (await read($, preview)) {
      await scrollPreview($, Math.sign(e.by) * Math.max(3, Math.abs(e.by)))

      return {}
    }
    const total = (await treeRows($)).length
    await update($, top, t => Math.max(0, Math.min(Math.max(0, total - room), t + Math.sign(e.by) * Math.max(3, Math.abs(e.by)))))

    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Button } = $.ui.resolve(e)

    return (
      <Box>
        <Button key="files" plain label="▤ Files" dimColor onPress={() => void show($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') {
      const { Text } = $.ui.resolve(e)

      return <Text dimColor>The file tree draws in the terminal and the desktop app.</Text>
    }
    const { Box, Button, Client, Input, Text } = $.ui.resolve(e)
    const current = await read($, styleName)
    const style = STYLES[isStyle(current) ? current : 'ide']
    const ctx = { icons: settings.icons, now: await $.clock.now() }
    const r = await read($, root)
    const snap = await read($, git)
    const header = style.header({ name: r.split('/').pop() || r, git: snap, dirty: Boolean(snap && Object.keys(snap.files).length), status: statusLine(await read($, marks), r) }, ctx)
    const shown = await read($, preview)
    const body = Math.max(6, (e.props.scroll?.bodyRows ?? 24) - header.length - 4)
    const isSplit = Boolean(shown) && settings.layout === 'split'
    room = isSplit ? Math.max(3, Math.floor(body / 2)) : body
    previewRoom = shown ? (isSplit ? body - room - 2 : body - 2) : previewRoom
    const all = await decorate($, await treeRows($))
    const from = Math.max(0, Math.min(await read($, top), Math.max(0, all.length - room)))
    const specs = all.slice(from, from + room).map(row => style.row(row, ctx))
    const search = await read($, query)
    const message = await read($, note)
    const text = await read($, previewText)
    const win = windowOf(text, await read($, previewTop), previewRoom)
    const previewProps = { rows: [], active: '', preview: { text: isMarkdown(shown) ? text : win.source, path: shown, startLine: win.startLine, markdown: isMarkdown(shown) } }
    const snapFile = shown ? snap?.files[shown] : undefined
    const facts = [
      `${text.split('\n').length} lines`,
      snapFile ? `${snapFile.status} +${snapFile.added ?? 0} -${snapFile.removed ?? 0}` : '',
      await read($, previewNote),
    ].filter(Boolean).join(' · ')
    const previewBar = (
      <Box key="pbar" justifyContent="space-between">
        <Box gap={1}>
          {!isSplit && <Button key="back" plain label="← files" onPress={() => void closePreview($)} />}
          <Text bold>{shown.split('/').pop()}</Text>
          <Text dimColor>{facts}</Text>
        </Box>
        <Box gap={1}>
          <Button key="open-ext" plain label="↗" onPress={() => void openExternal($, shown)} />
          {isSplit && <Button key="close-preview" plain label="✕" onPress={() => void closePreview($)} />}
        </Box>
      </Box>
    )
    const tree = <Client key="rows" module="./rows.client.tsx" props={{ rows: specs, active: await read($, cursor) }} />

    return (
      <Box flexDirection="column">
        {header.map((spec: RowSpec, i: number) => (
          <Box key={`h${i}`} justifyContent="space-between">
            <Box>{spec.left.map((s: Seg) => <Text color={s.c} bold={s.b} dimColor={s.dim}>{s.t}</Text>)}</Box>
            <Box>{spec.right.map((s: Seg) => <Text color={s.c} bold={s.b} dimColor={s.dim}>{s.t}</Text>)}</Box>
          </Box>
        ))}
        <Box gap={2}>
          <Button key="refresh" plain hotkey="r" label="Refresh" dimColor onPress={() => void reset($)} />
          <Button key="find" plain hotkey="s" label="Search" dimColor onPress={() => void $.ui.focus({ requestId: PANE, key: 'search' })} />
          <Button
            key="style"
            plain
            hotkey="t"
            label={`◐ ${current}`}
            dimColor
            onPress={async () => {
              const was = await read($, styleName)
              const next = nextStyle(isStyle(was) ? was : 'ide')
              await $.store.set(STYLE_KEY, { style: next, over: settings.style })
              await update($, styleName, () => next)
            }}
          />
          <Button key="close" plain hotkey="x" label="Close" dimColor onPress={() => void $.ui.close({ id: PANE })} />
        </Box>
        <Input
          key="search"
          label="Search"
          placeholder="file name"
          value={search}
          onInput={(value: string) => {
            void (async () => {
              await update($, query, () => value)
              await update($, top, () => 0)
              if (value.trim() && (await read($, files)).length === 0) await loadFiles($).catch(() => undefined)
            })()
          }}
          onSubmit={() => {
            void (async () => {
              const rows = await treeRows($)
              const first = rows.find(row => row.kind === 'file')
              if (first) await moveTo($, rows, first.path)
            })()
          }}
        />
        {message !== '' && <Text color="warning">{message}</Text>}
        {shown && !isSplit && previewBar}
        {shown && !isSplit
          ? <Client key="rows" module="./rows.client.tsx" props={previewProps} />
          : tree}
        {isSplit && <Text key="div" dimColor>{'─'.repeat(Math.max(10, (e.props.bodyColumns ?? 40) - 2))}</Text>}
        {isSplit && previewBar}
        {isSplit && <Client key="preview" module="./rows.client.tsx" props={previewProps} />}
      </Box>
    )
  })
}
