// What the hooks module and the board's surface module hand each other.
import type { JsonValue } from 'claude-code'

export const PANE_ID = 'tetris'
export const CLIENT_KEY = 'board'

/**
 * The board's props: saved progress, the room it has, and `away`, a count
 * that goes up whenever the person types at the prompt mid-game.
 */
export type TetrisProps = {
  best: number
  saved: JsonValue
  away: number
  columns: number
  rows: number
}

/** `save` carries the running game; `over` the final score of a finished one. */
export type TetrisMessage = { type: 'save'; game: JsonValue } | { type: 'over'; score: number }

/** Whether a saved game (as posted) is mid-play, so prompt typing should pause it. */
export function isRunning(game: JsonValue): boolean {
  return typeof game === 'object' && game !== null && !Array.isArray(game) && 'phase' in game && game.phase === 'playing'
}

/** Reads a post from the board; anything else is null. */
export function parseMessage(data: unknown): TetrisMessage | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const fields = data as { readonly [key: string]: JsonValue }
  if (fields.type === 'save' && typeof fields.game === 'object' && fields.game !== null) {
    return { type: 'save', game: fields.game }
  }
  if (fields.type === 'over' && Number.isInteger(fields.score) && (fields.score as number) >= 0) {
    return { type: 'over', score: fields.score as number }
  }
  return null
}
