# file-tree — design

A Claude Code mod: an IDE-style file tree in a pane that shows which files Claude reads, edits and commits, with git status, search and a read-only file preview. Three visual styles, picked in `/config` or cycled from the pane.

## Goals

- A file tree of the session's working directory, docked beside the transcript.
- Claude's activity on files visible as it happens.
- Git status per file and folder.
- Search that reaches folders not opened yet.
- A read-only preview of a file, plus a way to open it in the person's editor.
- Three styles (`ide`, `minimal`, `rich`) sharing one data model.

## Non-goals (first version)

- Editing, creating, deleting or renaming files.
- Adding the selected file to the prompt as context.
- A size column.
- Choosing the pane's side: the engine docks panes to the right of the transcript (fullscreen, 110+ columns) or above the prompt; the mod API has no option for the left.

## Layout of the mod

```
file-tree/
  .claude-plugin/plugin.json   name, version, userConfig, types
  hooks/hooks.json             { "modules": ["./register.tsx"] }
  hooks/register.tsx           wiring: hooks, /tree command, band button, pane render
  hooks/tree.ts                directory cache, open/closed folders, flattening, search
  hooks/git.ts                 git status / numstat parsing, folder roll-up, branch info
  hooks/activity.ts            tool call -> (paths, kind) mapping, timed highlights
  hooks/preview.ts             safe file loading, Code vs Markdown, open-with command
  hooks/styles/ide.tsx         row and header drawing per style; all take the same RowModel
  hooks/styles/minimal.tsx
  hooks/styles/rich.tsx
  hooks/rows.client.tsx        Client module that animates the shimmer on the surface
  types/index.d.ts             PluginState contract
  tests/*.test.ts(x)
```

`tree.ts`, `git.ts`, `activity.ts` and `preview.ts` hold pure functions where possible (parsers, mappers, flatteners) so they are tested without the UI.

## Opening the pane

- `/tree` opens the pane or brings it forward with the keyboard on it; `/tree close` closes it.
- A `▤ Files` button above the prompt (AbovePrompt band) opens it.
- Pane id `file-tree`. Placement is the engine's: docked right in fullscreen from 110 columns, otherwise inline above the prompt.

## Tree data (`tree.ts`)

- Root: `$.session.cwd()`; when it changes the tree re-roots.
- A folder is listed (`$.fs.list`) the first time it is opened, then cached by path. The whole repo is never walked for display.
- Hidden always: `.git`, `node_modules`. Git-ignored entries are hidden too (`git check-ignore --stdin` on each newly listed folder's entries); the `Show ignored files` setting shows them dimmed instead.
- Order: folders first, then files, by name, case-insensitive.
- `RowModel`: the flat list of visible rows. Each row: `path`, `name`, `depth`, `kind` (`file` | `dir`), `isOpen`, `git` (`status`, `added`, `removed`, folder counts), `activity` (`read` | `write` | `commit`, live or fading), `mtimeMs`.

### Navigation

- `↑`/`↓` move; `→` opens a folder; `←` closes it or moves to the parent; `Enter` or double-click on a file previews it; click selects.
- The view scrolls to keep the cursor visible; the wheel scrolls.

### Search

- `/` or `s` focuses the search field.
- Candidates: `git ls-files --cached --others --exclude-standard` in a repo; outside one, `find` with a depth and count cap.
- Match: every word of the query is in the path, ignoring case and diacritics (same `fold` as session-switcher).
- Results show as a tree opened down to the matches. `Esc` clears the search.

### Refresh

- After each file-editing tool call and each Bash call, the affected folders are re-listed.
- `r` refreshes by hand. There is no file-system watch in the API, so edits made outside Claude show after `r` or the next turn.

## Claude activity (`activity.ts`)

A `tool.call` hook that only observes: it always returns `next(e)` and never blocks or delays a call.

| Tool | Mark | Color |
|---|---|---|
| `Read`, `Grep`, `Glob` (their file or folder target) | read | purple |
| `Edit`, `Write`, `NotebookEdit` | write | orange |
| `Bash` running `git commit` that succeeds | commit: the files of the new commit (`git diff-tree --no-commit-id --name-only -r HEAD`) | green |
| other `Bash` (`git checkout`, `pull`, `merge`, ...) | no file mark; refresh tree and git | — |

- While the call runs, a light band sweeps across the file name. It is drawn by a `Client` module on the surface (about one frame per 90 ms), so the hook is not re-run per frame.
- After the call, the row keeps a faint tint for about 4 seconds, then clears.
- Closed folders open down to the target file, and the view scrolls to it unless `Follow Claude` is `off`.
- Subagents' tool calls count the same as the main loop's.
- Per style: `ide` sweeps the name; `minimal` colors the name and blinks a `•`; `rich` sweeps the name and shows a status line in the header ("● Claude is editing LoginController.php").

## Git (`git.ts`)

- `git --no-optional-locks status --porcelain=v2 --branch`: per-file status, branch, upstream, ahead/behind.
- `git --no-optional-locks diff --numstat HEAD`: `+N`/`-N` per file.
- Folders roll up their files: counts of modified, untracked, deleted.
- Runs on pane open, after file-editing tools and Bash, and on `r`; bursts are debounced (about 300 ms).
- Outside a git repo, checked once, then git features stay off for that root.
- Colors use Claude Code theme keys (`diffAdded`, `diffRemoved`, `warning`, ...) so they follow the person's theme: modified `M` yellow, untracked/new `U` green, deleted `D` red, renamed `R` blue, conflict `!` red bold.
- Header: branch, `↑ahead ↓behind`, a dot when the tree has uncommitted changes.

## Styles

All three draw from the same `RowModel` and header data.

- `ide`: file-type icons, indent guides `│`, git letter in the right column, selected row with a background.
- `minimal`: no icons, dim text, a colored `•` for git; only changed files and Claude's activity stand out.
- `rich`: icons, Claude status line in the header, right column with `+N -N` for files, `M:2 ?:1` for folders, and the file's age for unchanged entries.

Icons: `Icons` setting `nerd` (Nerd Font glyphs) or `unicode` (plain glyphs, default).

## Preview (`preview.ts`)

- Opened with `Enter` or double-click on a file.
- `Preview layout` setting:
  - `replace`: the preview fills the pane; `← files` or `←` returns to the tree.
  - `split`: the tree on top, the preview below; moving the cursor to another file updates the preview; `✕` closes it.
- Markdown files (`.md`, `.mdx`, `.markdown`) render with the `Markdown` element; other files with the `Code` element (`path` for language inference, `startLine` for line numbers).
- Header: path relative to the root, line count, git status and `+N -N`.
- Limits: only files inside the root; a file holding a NUL byte shows "binary file"; files over 4 MB are not read; one drawing holds at most about 100,000 characters, beyond which the preview says "first N lines".
- Scrolling: `↑`/`↓`, `PgUp`/`PgDn`, the wheel.
- `↗` opens the file with the `Open with` command: run without a shell, words split on spaces, quotes keep a word whole; `{path}` is the file and `{dir}` its folder; without `{path}` the path goes last. Empty: the platform's default app (`open`, `xdg-open`, `start`).

## Settings (`userConfig`, shown in `/config`)

| Field | Values | Default |
|---|---|---|
| Style | `ide`, `minimal`, `rich` | `ide` |
| Preview layout | `replace`, `split` | `replace` |
| Open with | command string | empty |
| Follow Claude | `on`, `off` | `on` |
| Icons | `nerd`, `unicode` | `unicode` |
| Show ignored files | `on`, `off` | `off` |

The header's `◐` button (hotkey `t`) cycles the style at once and stores the choice in `$.store`, together with the `/config` value it overrode. When the `/config` value differs from that remembered value (the person changed it), the `/config` value wins and the override is dropped.

## State

`$.state` (session) holds the UI state the drawing reads: open folders, cursor, scroll, search query, preview path and scroll, live activity marks, git snapshot. The directory cache stays in module memory (rebuilt after a reload). `$.store` holds only the style override.

## Errors

- Any failure in `$.fs` or `$.process` is caught; the pane shows a short yellow note (as session-switcher does) and keeps the last good data.
- The activity hook wraps its work in `try` and always calls `next(e)`.
- Git or `find` calls have timeouts; a timeout leaves the previous snapshot in place.

## Testing

- Pure: sorting and flattening, ignore filtering, porcelain v2 and numstat parsing, folder roll-up, tool-call to (paths, kind) mapping, diacritic-insensitive search, open-with argument splitting, preview limits and binary detection.
- UI (mounted Pane, on `terminal` and `desktop`): each style draws the expected rows and right column; `◐` cycles the style; preview opens and returns in `replace` and `split`; search filters the rows.
- Every commit passes `claude plugin validate`, `claude plugin test`, and a type-check that emits no files.

## Release

- Folder `cc-mods/file-tree/`, added to `.claude-plugin/marketplace.json`.
- README section with an SVG example drawn from made-up data.
- Small, atomic commits; the private-terms check before each commit.
