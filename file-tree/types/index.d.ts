export type Note = string

declare module 'claude-code' {
  interface PluginState {
    'file-tree': { note: Note }
  }
}
