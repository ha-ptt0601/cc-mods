export type SessionRow = { id: string; title: string; mtimeMs: number }

declare module 'claude-code' {
  interface PluginState {
    'session-switcher': { sessions: SessionRow[]; isLoading: boolean; note: string }
  }
}
