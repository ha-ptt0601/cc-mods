export type Saved = { path: string; savedAt: number; tokens: number }
export type Previous = { name: string; savedAt: number }
export type ResumeCost = { tokens: number; usd?: number }

declare module 'claude-code' {
  interface PluginState {
    handoff: {
      tokens: number
      saved: Saved | null
      previous: Previous | null
      resumeCost: ResumeCost | null
      isSaving: boolean
      transcript: string | null
    }
  }
}
