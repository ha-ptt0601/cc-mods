/** One entry of a listed folder. */
export type Entry = { name: string; kind: 'file' | 'dir'; mtimeMs: number; isIgnored: boolean }

export type GitStatus = 'M' | 'A' | 'U' | 'D' | 'R' | '!'
export type FileGit = { status: GitStatus; added?: number; removed?: number }
export type GitSnapshot = {
  branch: string
  upstream: string
  ahead: number
  behind: number
  files: Record<string, FileGit>
}

export type Kind = 'read' | 'write' | 'commit'
export type Mark = { path: string; kind: Kind; isLive: boolean; until: number }

declare module 'claude-code' {
  interface PluginState {
    'file-tree': {
      root: string
      listing: Record<string, Entry[]>
      open: string[]
      cursor: string
      top: number
      query: string
      files: string[]
      preview: string
      previewText: string
      previewNote: string
      previewTop: number
      marks: Mark[]
      git: GitSnapshot | null
      note: string
      style: string
    }
  }
}
