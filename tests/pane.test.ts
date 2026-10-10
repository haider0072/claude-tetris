import type { PromptEditInput, PromptEditResult } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { IDLE_PAUSE_MS } from '../hooks/client.tsx'
import { CLEAR_MS, gravityMs } from '../hooks/game.ts'

/**
 * The kit raises every event on its `$`, the composer's `prompt.edit` too, but
 * its typings list only the calls a plugin's own `$` can make; this names it.
 */
type ComposerEngine = { prompt: { edit: (e: PromptEditInput) => Promise<PromptEditResult> } }

function typeAtPrompt($: Engine, text: string): Promise<PromptEditResult> {
  const composer = $ as unknown as ComposerEngine
  return composer.prompt.edit({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: text })
}

const SURFACES = ['terminal', 'desktop'] as const
type Surface = (typeof SURFACES)[number]

const DOCKED = {
  title: 'Tetris',
  isFocused: true,
  bodyColumns: 44,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 24 },
  view: {},
} as const
const NARROW = { ...DOCKED, bodyColumns: 30, placement: 'inline', scroll: { offset: 0, bodyRows: 14 } } as const

function mountBoard($: Engine, surface: Surface, props: typeof DOCKED | typeof NARROW = DOCKED) {
  return $.ui.mount({ plugin: 'tetris', surface, component: 'Pane', requestId: 'tetris', props })
}

type Board = Awaited<ReturnType<typeof mountBoard>>

const press = (ui: Board, key: string) => ui.key({ key, in: 'board' })
const shows = async (ui: Board, text: string | RegExp) => (await ui.find({ in: 'board', text })) !== undefined

/** The value drawn under a panel label (SCORE, BEST, ...). */
async function panelValue(ui: Board, label: string): Promise<string | undefined> {
  const texts = await ui.findAll({ type: 'Text', in: 'board' })
  const index = texts.findIndex(text => text.text === label)
  return index >= 0 ? texts[index + 1]?.text : undefined
}

/** Hard-drops pieces until the well overflows. */
async function playUntilOver(ui: Board): Promise<void> {
  for (let drop = 0; drop < 60 && !(await shows(ui, 'GAME OVER')); drop += 1) {
    await press(ui, ' ')
    await ui.advance(CLEAR_MS)
  }
}

describe('/tetris', () => {
  test('opens the pane and asks for the keyboard', async ($, on) => {
    const opened: unknown[] = []
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('ui.open', ($, e) => {
      opened.push(e)
      return { value: { isPlaced: true } }
    })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.command.run({
      command: 'tetris',
      args: '',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: true, columns: 160 },
    })
    expect(opened).toHaveLength(1)
    expect(opened[0]).toMatchObject({ id: 'tetris', focus: true })
  })
})

for (const surface of SURFACES) {
  describe(`the board on ${surface}`, () => {
    test('starts, pauses and resumes from the keyboard', async ($, on) => {
      mock.store(on)
      const ui = await mountBoard($, surface)
      expect(await shows(ui, 'SPACE  to start')).toBe(true)
      await press(ui, ' ')
      expect(await shows(ui, 'SPACE  to start')).toBe(false)
      await press(ui, 'p')
      expect(await shows(ui, 'PAUSED')).toBe(true)
      await press(ui, 'p')
      expect(await shows(ui, 'PAUSED')).toBe(false)
    })

    test('gravity moves the piece as the clock runs', async ($, on) => {
      mock.store(on)
      const ui = await mountBoard($, surface)
      await press(ui, ' ')
      const before = JSON.stringify(await ui.drawn({ in: 'board' }))
      await ui.advance(gravityMs(1))
      expect(JSON.stringify(await ui.drawn({ in: 'board' }))).not.toBe(before)
    })

    test('pauses as soon as the person types at the prompt', async ($, on) => {
      mock.store(on)
      on('prompt.edit', ($, e) => ({ text: e.text + e.inputText, cursor: e.cursor + e.inputText.length }))
      const ui = await mountBoard($, surface)
      await press(ui, ' ')
      await press(ui, ' ')
      expect(await shows(ui, 'PAUSED')).toBe(false)
      await typeAtPrompt($, 'h')
      expect(await shows(ui, 'PAUSED')).toBe(true)
    })

    test('pauses itself when no key comes for a while, and any game key resumes', async ($, on) => {
      mock.store(on)
      const ui = await mountBoard($, surface)
      await press(ui, ' ')
      await ui.advance(IDLE_PAUSE_MS - 1000)
      await press(ui, 'left')
      await ui.advance(IDLE_PAUSE_MS - 1000)
      expect(await shows(ui, 'PAUSED')).toBe(false)
      await ui.advance(1000)
      expect(await shows(ui, 'PAUSED')).toBe(true)
      await press(ui, 'left')
      expect(await shows(ui, 'PAUSED')).toBe(false)
    })

    test('a game that beats the best shows NEW BEST', async ($, on) => {
      mock.store(on)
      const ui = await mountBoard($, surface)
      await press(ui, ' ')
      await playUntilOver(ui)
      expect(await shows(ui, 'NEW BEST')).toBe(true)
      await ui.redraw()
      expect(await shows(ui, 'NEW BEST')).toBe(true)
    })

    test('a game left running comes back paused in the next pane', async ($, on) => {
      mock.store(on)
      const first = await mountBoard($, surface)
      await press(first, ' ')
      await press(first, ' ')
      const score = await panelValue(first, 'SCORE')
      await first.unmount()

      const next = await mountBoard($, surface)
      expect(await shows(next, 'PAUSED')).toBe(true)
      expect(await panelValue(next, 'SCORE')).toBe(score)
      await press(next, 'p')
      expect(await shows(next, 'PAUSED')).toBe(false)
    })

    test("a finished game's score is kept as the best", async ($, on) => {
      mock.store(on)
      const ui = await mountBoard($, surface)
      await press(ui, ' ')
      await playUntilOver(ui)
      expect(await shows(ui, 'GAME OVER')).toBe(true)
      const score = await panelValue(ui, 'SCORE')
      await ui.unmount()

      const next = await mountBoard($, surface)
      expect(await shows(next, 'SPACE  to start')).toBe(true)
      expect(await panelValue(next, 'BEST')).toBe(score)
    })

    test('a narrow pane draws the compact board', async ($, on) => {
      mock.store(on)
      const ui = await mountBoard($, surface, NARROW)
      expect(await shows(ui, 'TETRIS')).toBe(true)
      await press(ui, ' ')
      expect(await shows(ui, /[▀▄█]/)).toBe(true)
    })
  })
}

describe('surfaces without a board', () => {
  test('mobile says where Tetris plays', async ($, on) => {
    mock.store(on)
    const ui = await $.ui.mount({ plugin: 'tetris', surface: 'mobile', component: 'Pane', requestId: 'tetris', props: DOCKED })
    expect(await ui.find({ type: 'Text', text: /terminal and the desktop app/ })).toBeDefined()
  })
})
