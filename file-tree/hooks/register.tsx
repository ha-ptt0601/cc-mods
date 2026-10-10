import type { EngineInterface, Register } from 'claude-code'

const PANE = 'file-tree'

/**
 * Opens the file tree pane, or brings an open one forward, with the keyboard on it.
 */
async function show($: EngineInterface): Promise<string> {
  await $.ui.open({ id: PANE, title: 'Files', focus: true, columns: 48 })

  return 'Files: ↑↓ move · → open · ← close · Enter preview · s search · t style · x close'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'tree',
      description: 'Open the file tree (close: hide it)',
      argumentHint: '[close]',
    })

    return started
  })

  on('command.run', { command: 'tree' }, async ($, e) => {
    if (/^(close|hide|x)$/i.test(e.args.trim())) {
      await $.ui.close({ id: PANE })

      return { text: 'File tree closed.' }
    }

    return { text: await show($) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Button } = $.ui.resolve(e)

    return (
      <Box>
        <Button key="files" plain label="▤ Files" dimColor onPress={() => void show($)} />
      </Box>
    )
  })
}
