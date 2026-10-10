import { atom, read, update } from 'claude-code'
import type { EngineInterface, JsonValue, PromptEditInput, Register } from 'claude-code'
import { CLIENT_KEY, PANE_ID, isRunning, parseMessage } from './protocol.ts'
import type { TetrisMessage, TetrisProps } from './protocol.ts'

const SAVE_KEY = 'game'
const BEST_KEY = 'best'
/** Room for the docked layout: a framed 22-column well, a gap and an 18-column panel; 22 rows plus the frame. */
const PANE = { id: PANE_ID, title: 'Tetris', columns: 44, rows: 24 } as const
const away = atom({ plugin: 'tetris', key: 'away' } as const, 0)

export const register: Register = on => {
  /** Whether the board last reported a game in play: only then does prompt typing pause it. */
  let isPlaying = false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tetris',
      description: 'Play Tetris in a side pane',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: 'tetris' }, async $ => {
    await $.ui.open({ ...PANE, focus: true })
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>Tetris plays in the terminal and the desktop app.</Text>
    }
    const { Client } = $.ui.resolve(e)
    const props: TetrisProps = {
      ...(await readProgress($)),
      away: await read($, away),
      columns: e.props.bodyColumns,
      rows: e.props.scroll.bodyRows,
    }
    return <Client key={CLIENT_KEY} module="./client.tsx" props={props} width="100%" />
  })

  // Typing at the prompt means the person has left the board: pause it. A
  // bare cursor move, such as an arrow key in the prompt, is not typing.
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    if (isPlaying && changesDraft(e)) {
      isPlaying = false
      await update($, away, count => count + 1)
    }
    return box
  })

  on('ui.message', async ($, e, next) => {
    if (e.requestId !== PANE_ID || e.element !== CLIENT_KEY) return next(e)
    const message = parseMessage(e.data)
    if (!message) {
      $.ui.log('Ignored a malformed message from the board.', { to: 'debug' })
      return {}
    }
    isPlaying = message.type === 'save' && isRunning(message.game)
    await keep($, message)
    return {}
  })
}

/** The best score and the paused game; a store that cannot be read starts fresh. */
async function readProgress($: EngineInterface): Promise<Pick<TetrisProps, 'best' | 'saved'>> {
  try {
    const [best, saved] = await Promise.all([$.store.get(BEST_KEY), $.store.get(SAVE_KEY)])
    // The store only ever holds JSON; the board checks the game's shape itself.
    return { best: isScore(best) ? best : 0, saved: (saved ?? null) as JsonValue }
  } catch (error) {
    $.ui.log(`Could not read saved progress: ${describe(error)}`, { to: 'debug' })
    return { best: 0, saved: null }
  }
}

/** Saves a running game, or records a finished one's score and drops its save. */
async function keep($: EngineInterface, message: TetrisMessage): Promise<void> {
  try {
    if (message.type === 'save') {
      await $.store.set(SAVE_KEY, message.game)
      return
    }
    await $.store.delete(SAVE_KEY)
    const best = await $.store.get(BEST_KEY)
    if (!isScore(best) || message.score > best) await $.store.set(BEST_KEY, message.score)
  } catch (error) {
    $.ui.toast(`Tetris could not save progress: ${describe(error)}`)
  }
}

/** Whether an edit changes the draft (something typed, pasted or deleted) rather than only moving the cursor. */
function changesDraft(edit: PromptEditInput): boolean {
  return edit.inputText !== '' || edit.end > edit.start
}

function isScore(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
