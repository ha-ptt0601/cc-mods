import type { ClientModule } from 'claude-code'

import type { Kind } from './activity'
import type { RowSpec, Seg } from './segments'

export type RowsProps = {
  rows: RowSpec[]
  active: string
  preview?: { text: string; path: string; startLine: number; markdown: boolean }
}

type Local = { phase: number; hover: number; last: { id: string; at: number }; ref: { stop?: () => void } }

const TICK_MS = 90
const DOUBLE_MS = 400

/** Dark to bright, per activity tone. */
export const TONES: Record<Kind, string[]> = {
  read: ['#5b4a7a', '#8a6fc0', '#b89cf0', '#e6d8ff'],
  write: ['#7a4a2a', '#c0763a', '#f0a060', '#ffd8b0'],
  commit: ['#2f6a3a', '#4caf62', '#7fdc8f', '#c8f5d0'],
}

/**
 * The color of character `i` of a `len`-long name at animation `phase`: a
 * band of light that runs left to right and starts again.
 */
export function sweepColor(i: number, phase: number, len: number, palette: readonly string[]): string {
  const center = ((phase * 1.5) % (len + 8)) - 4
  const d = Math.abs(i - center)
  const step = d < 0.8 ? 3 : d < 1.8 ? 2 : d < 2.8 ? 1 : 0

  return palette[step] ?? palette[0] ?? '#ffffff'
}

const Rows: ClientModule<RowsProps, Local> = (props, surface) => {
  const { Box, Text, Code, Markdown } = surface.elements
  let state = surface.state
  if (state === undefined) {
    state = { phase: 0, hover: -1, last: { id: '', at: 0 }, ref: {} }
    surface.setState(state)
  }
  const animates = props.rows.some(r => [...r.left, ...r.right].some(s => s.sweep || s.blink))
  if (animates && !state.ref.stop) {
    state.ref.stop = surface.every(TICK_MS, () => {
      const cur = surface.state
      if (cur) surface.setState({ ...cur, phase: cur.phase + 1 })
    })
  } else if (!animates && state.ref.stop) {
    state.ref.stop()
    state.ref.stop = undefined
  }

  surface.onKey(e => surface.post({ key: e.key }))
  surface.onPointer(e => {
    const cur = surface.state ?? state
    if (!cur) return
    if (e.type === 'leave' || e.y < 0 || e.y >= props.rows.length) {
      if (cur.hover !== -1) surface.setState({ ...cur, hover: -1 })

      return
    }
    if (e.type === 'move' && cur.hover !== e.y) surface.setState({ ...cur, hover: e.y })
    if (e.type !== 'down' || (e.button ?? 'left') !== 'left') return
    const id = props.rows[e.y]?.id
    if (!id) return
    const now = Date.now()
    const isDouble = cur.last.id === id && now - cur.last.at < DOUBLE_MS
    surface.setState({ ...cur, last: { id, at: isDouble ? 0 : now } })
    surface.post(isDouble ? { open: id } : { press: id })
  })

  if (props.preview) {
    const p = props.preview

    return p.markdown
      ? <Markdown text={p.text} />
      : <Code source={p.text} path={p.path} startLine={p.startLine} wrap="truncate-end" />
  }

  const phase = state.phase
  const hover = state.hover
  const draw = (s: Seg) => {
    if (s.blink && phase % 6 >= 3) return <Text>{' '.repeat([...s.t].length)}</Text>
    const palette = s.tone ? TONES[s.tone] : undefined
    if (palette && s.sweep) {
      const chars = [...s.t]

      return (
        <Text bold={s.b}>
          {chars.map((ch, i) => <Text color={sweepColor(i, phase, chars.length, palette)}>{ch}</Text>)}
        </Text>
      )
    }
    const color = palette ? palette[2] : s.c

    return <Text color={color} bold={s.b} dimColor={s.dim}>{s.t}</Text>
  }

  return (
    <Box flexDirection="column">
      {props.rows.map((r, i) => (
        <Box
          flexDirection="row"
          height={1}
          overflow="hidden"
          backgroundColor={r.id && r.id === props.active ? '#313244' : i === hover ? '#262637' : undefined}
        >
          <Box flexShrink={1} overflow="hidden">{r.left.map(draw)}</Box>
          <Box flexGrow={1} />
          {r.right.map(draw)}
        </Box>
      ))}
    </Box>
  )
}

export default Rows
