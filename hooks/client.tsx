// The board's surface module: runs the game on the drawing thread, reads keys,
// and posts progress to the hooks module, which keeps it across sessions.
import type { ClientKeyEvent, ClientModule, ClientSurface } from 'claude-code'
import {
  createGame,
  hardDrop,
  hold,
  move,
  pause,
  resume,
  rotate,
  softDrop,
  start,
  tick,
} from './game.ts'
import type { Game } from './game.ts'
import { restore } from './save.ts'
import type { TetrisMessage, TetrisProps } from './protocol.ts'
import { draw } from './view.tsx'

/**
 * The game, held by reference so the clock and key listeners always see the
 * latest. `best` is the best score before this game, what a NEW BEST beats;
 * `away` the last prompt-typing count seen; `idleMs` the time since a key;
 * `lastTickAt` when the clock last fired.
 */
type Controller = { game: Game; best: number; away: number; idleMs: number; lastTickAt: number }
type State = { controller: Controller; rev: number }
type Surface = ClientSurface<State>

const TICK_MS = 25
/** The most game time one tick may cover: a stalled drawing thread slows the game rather than skipping it. */
const MAX_STEP_MS = 100
/** A running game with no key for this long pauses itself: the person has looked away. */
export const IDLE_PAUSE_MS = 6000
const CONFIRM_KEYS = new Set([' ', 'space', 'return', 'enter'])

const PLAY_KEYS: ReadonlyMap<string, (game: Game) => Game> = new Map([
  ['left', game => move(game, -1)],
  ['a', game => move(game, -1)],
  ['h', game => move(game, -1)],
  ['right', game => move(game, 1)],
  ['d', game => move(game, 1)],
  ['l', game => move(game, 1)],
  ['down', softDrop],
  ['s', softDrop],
  ['j', softDrop],
  ['up', game => rotate(game, 1)],
  ['x', game => rotate(game, 1)],
  ['w', game => rotate(game, 1)],
  ['k', game => rotate(game, 1)],
  ['z', game => rotate(game, -1)],
  [' ', hardDrop],
  ['space', hardDrop],
  ['c', hold],
  ['p', pause],
])

const Tetris: ClientModule<TetrisProps, State> = (props, surface) => {
  const controller = surface.state?.controller ?? mount(props, surface)
  followProps(controller, props, surface)
  const { game, best } = controller
  return draw({ game, best, columns: props.columns, rows: props.rows }, surface.elements)
}

export default Tetris

/** First draw: resume the saved game (paused) or a fresh one, start the clock, listen for keys. */
function mount(props: TetrisProps, surface: Surface): Controller {
  const controller: Controller = {
    game: restore(props.saved) ?? createGame(newSeed()),
    best: props.best,
    away: props.away,
    idleMs: 0,
    lastTickAt: Date.now(),
  }
  surface.setState({ controller, rev: controller.game.rev })
  surface.every(TICK_MS, () => onTick(controller, surface))
  surface.onKey(event => {
    controller.idleMs = 0
    commit(controller, onKey(controller.game, event), surface)
  })
  return controller
}

/**
 * Advances the game by the time that really passed: the frame clock fires on
 * drawn frames, so a 25 ms timer can come every 33 ms or so, and counting
 * TICK_MS alone would run gravity slow. A running game nobody has touched for
 * a while pauses itself.
 */
function onTick(controller: Controller, surface: Surface): void {
  const now = Date.now()
  const dt = Math.min(MAX_STEP_MS, Math.max(TICK_MS, now - controller.lastTickAt))
  controller.lastTickAt = now
  const { game } = controller
  if (game.phase !== 'playing') return
  controller.idleMs += dt
  commit(controller, controller.idleMs >= IDLE_PAUSE_MS ? pause(game) : tick(game, dt), surface)
}

/**
 * New props: a better saved best (held back while a finished game still shows
 * its NEW BEST), and a pause when the person has gone back to the prompt.
 */
function followProps(controller: Controller, props: TetrisProps, surface: Surface): void {
  if (controller.game.phase !== 'over') controller.best = Math.max(controller.best, props.best)
  if (props.away !== controller.away) {
    controller.away = props.away
    commit(controller, pause(controller.game), surface, false)
  }
}

/**
 * Makes `next` the game: posts what the hooks module keeps (a save on every
 * lock, hold or phase change; the score once it is over) and redraws when
 * something visible changed, unless the caller is drawing already.
 */
function commit(controller: Controller, next: Game, surface: Surface, redraw = true): void {
  const previous = controller.game
  if (next === previous) return
  controller.game = next

  if (previous.phase === 'over' && next.phase !== 'over') {
    controller.best = Math.max(controller.best, previous.score)
  }
  const message = messageFor(previous, next)
  if (message) surface.post(message)

  if (redraw && next.rev !== previous.rev) surface.setState({ controller, rev: next.rev })
}

function messageFor(previous: Game, next: Game): TetrisMessage | null {
  if (next.phase === 'over') return previous.phase === 'over' ? null : { type: 'over', score: next.score }
  const changed =
    next.board !== previous.board || next.phase !== previous.phase || next.hold !== previous.hold
  return changed && next.phase !== 'ready' ? { type: 'save', game: next } : null
}

function onKey(game: Game, event: ClientKeyEvent): Game {
  if (event.ctrl || event.meta) return game
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  switch (game.phase) {
    case 'ready':
      return CONFIRM_KEYS.has(key) ? start(game) : game
    case 'paused':
      if (key === 'r') return start(createGame(newSeed()))
      return CONFIRM_KEYS.has(key) || PLAY_KEYS.has(key) ? resume(game) : game
    case 'over':
      return CONFIRM_KEYS.has(key) || key === 'r' ? start(createGame(newSeed())) : game
    case 'playing':
      return PLAY_KEYS.get(key)?.(game) ?? game
  }
}

function newSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}
