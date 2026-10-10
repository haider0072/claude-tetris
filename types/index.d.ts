/** A count bumped each time the person goes back to the prompt mid-game; the board pauses on a change. */
export type TetrisAway = number

declare module 'claude-code' {
  interface PluginState {
    tetris: { away: TetrisAway }
  }
}
