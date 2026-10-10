/** One entry of a listed folder. */
export type Entry = { name: string; kind: 'file' | 'dir'; mtimeMs: number; isIgnored: boolean }

/** Every listed folder's sorted entries, by the folder's absolute path. */
export type Listing = Record<string, Entry[]>

/** One visible row of the tree. */
export type TreeRow = {
  path: string
  name: string
  depth: number
  kind: 'file' | 'dir'
  isOpen: boolean
  isIgnored: boolean
  mtimeMs: number
}

const HIDDEN = new Set(['.git', 'node_modules'])
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })

/**
 * `dir` and `name` joined with one slash.
 */
export function join(dir: string, name: string): string {
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`
}

/**
 * The folder holding `path`; `/` for a top-level path.
 */
export function parentOf(path: string): string {
  const at = path.lastIndexOf('/')

  return at <= 0 ? '/' : path.slice(0, at)
}

/**
 * Whether `path` is `root` or under it.
 */
export function isInside(root: string, path: string): boolean {
  return path === root || path.startsWith(root.endsWith('/') ? root : `${root}/`)
}

/**
 * `path` relative to `root` (no leading slash); `path` itself when outside.
 */
export function relative(root: string, path: string): string {
  if (path === root) return ''

  return isInside(root, path) ? path.slice(root.length).replace(/^\/+/, '') : path
}

/**
 * A folder's entries for the tree: files and folders only, `.git` and
 * `node_modules` left out, folders first, then by name ignoring case.
 *
 * @param ignored names git ignores in this folder
 * @param keepIgnored keep them, flagged, rather than leaving them out
 */
export function sortEntries(
  entries: readonly { name: string; kind: string; mtimeMs: number }[],
  ignored: ReadonlySet<string>,
  keepIgnored: boolean,
): Entry[] {
  return entries
    .filter(e => (e.kind === 'file' || e.kind === 'dir') && !HIDDEN.has(e.name))
    .filter(e => keepIgnored || !ignored.has(e.name))
    .map(e => ({ name: e.name, kind: e.kind as Entry['kind'], mtimeMs: e.mtimeMs, isIgnored: ignored.has(e.name) }))
    .sort((a, b) => (a.kind === b.kind ? byName(a.name, b.name) : a.kind === 'dir' ? -1 : 1))
}

/**
 * The visible rows: the root's entries, and under each open folder its own.
 */
export function flatten(root: string, listing: Listing, open: readonly string[]): TreeRow[] {
  const isOpen = new Set(open)
  const rows: TreeRow[] = []
  const walk = (dir: string, depth: number) => {
    for (const entry of listing[dir] ?? []) {
      const path = join(dir, entry.name)
      const opened = entry.kind === 'dir' && isOpen.has(path)
      rows.push({ path, name: entry.name, depth, kind: entry.kind, isOpen: opened, isIgnored: entry.isIgnored, mtimeMs: entry.mtimeMs })
      if (opened) walk(path, depth + 1)
    }
  }
  walk(root, 0)

  return rows
}

/**
 * The folders to open, outermost first, so that `path` shows in the tree.
 */
export function foldersTo(root: string, path: string): string[] {
  if (path === root || !isInside(root, path)) return []
  const out: string[] = []
  for (let dir = parentOf(path); dir !== root && isInside(root, dir); dir = parentOf(dir)) out.unshift(dir)

  return out
}

/**
 * Lowercase text with diacritics removed, so `y tuong` finds `Ý tưởng`.
 */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
}

/**
 * Whether every word of `query` is in `path`, ignoring case and diacritics.
 */
export function matches(path: string, query: string): boolean {
  const haystack = fold(path)

  return fold(query).split(/\s+/).filter(Boolean).every(word => haystack.includes(word))
}

type SearchNode = { dirs: Map<string, SearchNode>; files: string[] }

/**
 * The rows of a search: the matching files (paths relative to `root`) as a
 * tree opened down to each, folders first, at most `limit` files.
 */
export function searchRows(root: string, files: readonly string[], query: string, limit = 200): TreeRow[] {
  const top: SearchNode = { dirs: new Map(), files: [] }
  for (const hit of files.filter(file => matches(file, query)).slice(0, limit)) {
    const parts = hit.split('/')
    let node = top
    for (const part of parts.slice(0, -1)) {
      const next = node.dirs.get(part) ?? { dirs: new Map(), files: [] }
      node.dirs.set(part, next)
      node = next
    }
    node.files.push(parts.at(-1) ?? hit)
  }
  const rows: TreeRow[] = []
  const walk = (node: SearchNode, dir: string, depth: number) => {
    for (const name of [...node.dirs.keys()].sort(byName)) {
      const path = join(dir, name)
      rows.push({ path, name, depth, kind: 'dir', isOpen: true, isIgnored: false, mtimeMs: 0 })
      const child = node.dirs.get(name)
      if (child) walk(child, path, depth + 1)
    }
    for (const name of [...node.files].sort(byName)) {
      rows.push({ path: join(dir, name), name, depth, kind: 'file', isOpen: false, isIgnored: false, mtimeMs: 0 })
    }
  }
  walk(top, root, 0)

  return rows
}
