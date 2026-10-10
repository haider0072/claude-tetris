import type { PieceKind } from './game.ts'

/** One vivid color per piece, readable on both light and dark themes. */
export const PIECE_COLORS: Record<PieceKind, string> = {
  I: '#22d3ee',
  O: '#facc15',
  T: '#c084fc',
  S: '#4ade80',
  Z: '#f87171',
  J: '#60a5fa',
  L: '#fb923c',
}

/** Theme keys for everything that is not a piece, so the pane follows the person's theme. */
export const THEME = {
  accent: 'claude',
  text: 'text',
  muted: 'subtle',
  faint: 'inactive',
  good: 'success',
  warn: 'warning',
  bad: 'error',
} as const

/** The title's letters take the pieces' colors: T E T R I S. */
export const TITLE: readonly (readonly [letter: string, kind: PieceKind])[] = [
  ['T', 'Z'],
  ['E', 'L'],
  ['T', 'O'],
  ['R', 'S'],
  ['I', 'I'],
  ['S', 'T'],
]
