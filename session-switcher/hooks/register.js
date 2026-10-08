import { atom, read, update } from 'claude-code';
const PANE = 'sessions';
const LIMIT = 30;
const sessions = atom({ plugin: 'session-switcher', key: 'sessions' }, []);
const isLoading = atom({ plugin: 'session-switcher', key: 'isLoading' }, false);
const note = atom({ plugin: 'session-switcher', key: 'note' }, '');
/**
 * The text of a transcript's user message, or '' when it is not a typed prompt
 * (a tool result, a command's output, a hook's injected context).
 *
 * @param line one JSONL line of a transcript
 */
export function promptText(line) {
    try {
        const row = JSON.parse(line);
        if (row.type !== 'user' || row.isMeta)
            return '';
        const content = row.message?.content;
        const text = typeof content === 'string'
            ? content
            : Array.isArray(content)
                ? content.map(b => (b && typeof b === 'object' && 'text' in b ? String(b.text) : '')).join(' ')
                : '';
        const trimmed = text.trim();
        return trimmed.startsWith('<') ? '' : trimmed.replace(/\s+/g, ' ');
    }
    catch {
        return '';
    }
}
/**
 * The value of `key` on a JSONL line, or '' when the line does not parse.
 */
function field(line, key) {
    try {
        return String(JSON.parse(line)[key] ?? '');
    }
    catch {
        return '';
    }
}
/**
 * Groups `grep -H` output (`path:line`) by the transcript's session id.
 */
function byFile(stdout) {
    const found = new Map();
    for (const hit of stdout.split('\n')) {
        const at = hit.indexOf('.jsonl:');
        if (at < 0)
            continue;
        const id = hit.slice(0, at).split('/').pop() ?? '';
        found.set(id, [...(found.get(id) ?? []), hit.slice(at + 7)]);
    }
    return found;
}
/**
 * The paths of every worktree in `git worktree list --porcelain` output, the
 * main one first.
 */
export function worktreePaths(porcelain) {
    return porcelain
        .split('\n')
        .filter(line => line.startsWith('worktree '))
        .map(line => line.slice('worktree '.length).trim())
        .filter(Boolean);
}
/**
 * The folder Claude Code keeps a directory's transcripts in.
 */
export function projectDir(home, path) {
    return `${home}/.claude/projects/${path.replace(/[^a-zA-Z0-9]/g, '-')}`;
}
/**
 * Lists this project's sessions, its worktrees' included, newest first: one
 * row per transcript that holds at least one typed prompt, titled by its
 * custom or AI title.
 */
async function loadSessions($, trace) {
    const root = await $.session.root();
    const env = await $.process.run(['printenv', 'HOME']).catch(() => ({ stdout: '' }));
    const home = env.stdout.trim() || (/^\/(?:Users|home)\/[^/]+/.exec(root)?.[0] ?? '');
    const git = await $.process.run(['git', 'worktree', 'list', '--porcelain'], { cwd: root })
        .catch(() => ({ exitCode: 1, stdout: '' }));
    const listed = git.exitCode === 0 ? worktreePaths(git.stdout) : [];
    const trees = listed.includes(root) ? listed : [root, ...listed];
    trace.push(`root=${root}`, `home=${home}`, `dir=${projectDir(home, root)}`, `worktrees=${trees.length}`);
    const found = await Promise.all(trees.map(async (tree) => {
        const dir = projectDir(home, tree);
        if (!(await $.fs.exists(dir)))
            return [];
        return (await $.fs.list(dir))
            .filter(f => f.kind === 'file' && f.name.endsWith('.jsonl'))
            .map(f => ({ ...f, path: `${dir}/${f.name}`, worktree: tree === root ? undefined : tree.split('/').pop() }));
    }));
    const files = found.flat().sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, LIMIT);
    trace.push(`transcripts=${files.length}`);
    if (files.length === 0)
        return [];
    const paths = files.map(f => f.path);
    const grep = async (pattern, max) => byFile((await $.process.run(['grep', '-H', '-m', max, '-e', pattern, ...paths])).stdout);
    const [titles, prompts] = await Promise.all([
        grep('"type":"\\(custom-title\\|ai-title\\)"', '50'),
        grep('"type":"user"', '20'),
    ]);
    trace.push(`titled=${titles.size}`, `with prompts=${prompts.size}`);
    return files.flatMap(f => {
        const id = f.name.slice(0, -'.jsonl'.length);
        const firstPrompt = (prompts.get(id) ?? []).map(promptText).find(Boolean);
        if (!firstPrompt)
            return [];
        const titleLines = titles.get(id) ?? [];
        const custom = titleLines.map(l => field(l, 'customTitle')).filter(Boolean).at(-1);
        const ai = titleLines.map(l => field(l, 'aiTitle')).filter(Boolean).at(-1);
        return [{ id, title: custom || ai || firstPrompt, mtimeMs: f.mtimeMs, worktree: f.worktree }];
    });
}
/**
 * How long ago `ms` was, in the largest whole unit: `5m`, `3h`, `2d`.
 */
export function ago(ms, now) {
    const minutes = Math.max(0, Math.round((now - ms) / 60000));
    if (minutes < 60)
        return `${minutes}m`;
    if (minutes < 60 * 24)
        return `${Math.round(minutes / 60)}h`;
    return `${Math.round(minutes / 60 / 24)}d`;
}
/**
 * Reloads the session list into state, flagging the load while it runs.
 */
async function refresh($) {
    const trace = [];
    await update($, isLoading, () => true);
    try {
        const rows = await loadSessions($, trace);
        await update($, sessions, () => rows);
        await update($, note, () => (rows.length === 0 ? `No sessions found in ${trace[2] ?? '?'}` : ''));
    }
    catch (error) {
        trace.push(`error: ${String(error)}`);
        await update($, note, () => `Could not list sessions: ${String(error)}`);
    }
    finally {
        await update($, isLoading, () => false);
    }
}
/**
 * Opens the sessions pane, or brings an open one forward, with the keyboard
 * on it and the list reloaded.
 *
 * @returns a line saying what to press next
 */
async function show($) {
    await $.ui.open({ id: PANE, title: 'Sessions', focus: true, columns: 60 });
    void refresh($);
    return 'Sessions: press 1-9 or Enter to resume, x to close, Esc to go back (/sessions close hides it).';
}
export const register = on => {
    on('session.start', async ($, e, next) => {
        const started = await next(e);
        await $.command.register({
            name: 'sessions',
            description: "Open this project's sessions and pick one to resume (close: hide it)",
            argumentHint: '[close]',
        });
        return started;
    });
    on('command.run', { command: 'sessions' }, async ($, e) => {
        if (/^(close|hide|x)$/i.test(e.args.trim())) {
            await $.ui.close({ id: PANE });
            return { text: 'Sessions pane closed.' };
        }
        return { text: await show($) };
    });
    // The "icon": one small button above the prompt that opens the pane.
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
        if (e.props.hasSurvey)
            return next(e);
        const { Box, Button } = $.ui.resolve(e);
        return (<Box>
        <Button key="toggle" plain label="☰ Sessions" dimColor onPress={() => void show($)}/>
      </Box>);
    });
    on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
        const { Box, Button, Text } = $.ui.resolve(e);
        const rows = await read($, sessions);
        const current = await $.session.id();
        const now = await $.clock.now();
        const width = Math.max(10, (e.props.bodyColumns ?? 40) - 6);
        const others = rows.filter(row => row.id !== current);
        return (<Box flexDirection="column">
        <Box>
          <Button key="refresh" plain hotkey="r" label="Refresh" dimColor onPress={() => void refresh($)}/>
          <Text>  </Text>
          <Button key="close" plain hotkey="x" label="Close" dimColor onPress={() => void $.ui.close({ id: PANE })}/>
          {(await read($, isLoading)) && <Text dimColor>  loading…</Text>}
        </Box>
        {e.props.isFocused
                ? <Text dimColor>1-9 / Enter resume · ↑↓ tab move · r refresh · x close · Esc back</Text>
                : <Text dimColor>type /sessions (or ctrl+x tab) to use the keys</Text>}
        {(await read($, note)) !== '' && <Text color="yellow">{await read($, note)}</Text>}
        {rows.map(row => {
                const isCurrent = row.id === current;
                const when = `${row.worktree ? `[${row.worktree}] ` : ''}${ago(row.mtimeMs, now)} ago`;
                const title = row.title.slice(0, Math.max(5, width - when.length - 4));
                if (isCurrent) {
                    return (<Box key={row.id}>
                <Text color="green" bold>▸ {title}</Text>
                <Text dimColor>  (this session)</Text>
              </Box>);
                }
                const slot = others.indexOf(row);
                return (<Box key={row.id}>
              <Button key={row.id} plain hotkey={slot < 9 ? String(slot + 1) : undefined} autoFocus={slot === 0 ? true : undefined} label={slot < 9 ? title : `   ${title}`} onPress={() => {
                        $.ui.toast(`Resuming: ${row.title.slice(0, 40)}`);
                        void $.command.run({ command: 'resume', args: row.id });
                    }}/>
              <Text dimColor>  {when}</Text>
            </Box>);
            })}
      </Box>);
    });
};
