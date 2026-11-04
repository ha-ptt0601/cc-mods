export type Saved = { path: string; savedAt: number; tokens: number }
export type ResumeCost = { tokens: number; usd?: number }

declare module 'claude-code' {
  interface PluginState {
    handoff: {
      tokens: number
      saved: Saved | null
      resumeCost: ResumeCost | null
      isSaving: boolean
    }
  }
}
