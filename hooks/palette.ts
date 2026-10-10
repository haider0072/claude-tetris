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

/** How much darker a block's lower and right edge is than its face, for the bevel on large blocks. */
const EDGE_SHADE = 0.62

/** Each piece color darkened: the shadow edge of a large block. */
export const PIECE_EDGES = Object.fromEntries(
  Object.entries(PIECE_COLORS).map(([kind, color]) => [kind, darken(color, EDGE_SHADE)]),
) as Record<PieceKind, string>

/** A `#rrggbb` color with each channel scaled by `factor`. */
function darken(hex: string, factor: number): string {
  const channels = [1, 3, 5].map(at => Math.round(parseInt(hex.slice(at, at + 2), 16) * factor))
  return `#${channels.map(value => value.toString(16).padStart(2, '0')).join('')}`
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
