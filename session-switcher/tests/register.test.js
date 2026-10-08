import { describe, expect, test, tier } from 'claude-code/testing';
import { ago, projectDir, promptText, worktreePaths } from '../hooks/register';
tier('user');
describe('promptText', () => {
    test('reads a typed prompt, string or blocks', async () => {
        expect(promptText('{"type":"user","message":{"content":"liệt kê file"}}')).toBe('liệt kê file');
        expect(promptText('{"type":"user","message":{"content":[{"type":"text","text":"hi  there"}]}}')).toBe('hi there');
    });
    test('skips command output, meta rows and broken lines', async () => {
        expect(promptText('{"type":"user","message":{"content":"<command-name>/meter</command-name>"}}')).toBe('');
        expect(promptText('{"type":"user","isMeta":true,"message":{"content":"x"}}')).toBe('');
        expect(promptText('{"type":"assistant","message":{"content":"x"}}')).toBe('');
        expect(promptText('not json')).toBe('');
    });
});
describe('ago', () => {
    test('picks the largest whole unit', async () => {
        const now = 10 * 24 * 3600000;
        expect(ago(now - 5 * 60000, now)).toBe('5m');
        expect(ago(now - 3 * 3600000, now)).toBe('3h');
        expect(ago(now - 2 * 24 * 3600000, now)).toBe('2d');
    });
});
describe('worktreePaths', () => {
    test('reads every worktree, the main one first', async () => {
        const porcelain = [
            'worktree /Users/me/work/api', 'HEAD abc', 'branch refs/heads/main', '',
            'worktree /Users/me/work/api/.claude/worktrees/fix-1', 'HEAD def', 'branch refs/heads/fix-1', '',
        ].join('\n');
        expect(worktreePaths(porcelain)).toEqual(['/Users/me/work/api', '/Users/me/work/api/.claude/worktrees/fix-1']);
        expect(worktreePaths('')).toEqual([]);
    });
});
describe('projectDir', () => {
    test('names the transcripts folder like Claude Code does', async () => {
        expect(projectDir('/Users/me', '/Users/me/work/api/.claude/worktrees/fix-1'))
            .toBe('/Users/me/.claude/projects/-Users-me-work-api--claude-worktrees-fix-1');
    });
});
describe('band', () => {
    test('draws the Sessions button above the prompt', async ($) => {
        const ui = await $.ui.mount({
            plugin: 'session-switcher',
            surface: 'terminal',
            component: 'AbovePrompt',
            props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 80, scroll: { offset: 0, bodyRows: 3 }, view: {} },
            viewport: { columns: 80, rows: 24 },
        });
        expect((await ui.find({ key: 'toggle' }))?.text).toContain('Sessions');
        await ui.unmount();
    });
});
