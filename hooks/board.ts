// The well as lines of spans, at any block size, with the words for a waiting,
// paused or finished game laid over its middle.
import { COLS, EMPTY, FLASH, VISIBLE_ROWS, visibleRows } from './game.ts'
import type { Game, PieceKind } from './game.ts'
import { PIECE_COLORS, PIECE_EDGES, THEME } from './palette.ts'
import { centre, formatNumber, gap, merge, text, title } from './spans.ts'
import type { Line, Span } from './spans.ts'

/**
 * How big a block is drawn: `n` is n lines tall and 2n cells wide (about
 * square in a monospace grid); `0` packs two board rows into one line with
 * half-block glyphs, for a pane with little room.
 */
export type Scale = 0 | 1 | 2 | 3

/** Keys reach the board once it is clicked. */
const CLICK_HINT = 'click board to play'

export function boardWidth(scale: Scale): number {
  return scale === 0 ? COLS : COLS * 2 * scale
}

export function boardHeight(scale: Scale): number {
  return scale === 0 ? VISIBLE_ROWS / 2 : VISIBLE_ROWS * scale
}

export function boardLines(game: Game, best: number, scale: Scale): Line[] {
  const rows = visibleRows(game)
  const lines = scale === 0 ? halfBlockLines(rows) : blockLines(rows, scale)
  return overlay(lines, overlayFor(game, best, scale > 0), boardWidth(scale))
}

function kindOf(code: string): PieceKind | null {
  const upper = code.toUpperCase()
  return upper in PIECE_COLORS ? (upper as PieceKind) : null
}

function isGhost(code: string): boolean {
  return code !== code.toUpperCase()
}

// ── Blocks: each board row is `scale` lines, a dotted well behind ─────────

function blockLines(rows: readonly string[], scale: number): Line[] {
  return rows.flatMap(row =>
    Array.from({ length: scale }, (_, band) => merge([...row].flatMap(code => blockCell(code, band, scale)))),
  )
}

const WELL_DOT: Span = { text: '·', style: { color: THEME.faint, dimColor: true } }

/** Line `band` of one cell; a large block gets a lit face and a shadowed right and bottom edge. */
function blockCell(code: string, band: number, scale: number): Span[] {
  const width = 2 * scale
  if (code === EMPTY) {
    // A dot in the middle of the cell, so the dots sit evenly between the walls.
    const middle = Math.floor((scale - 1) / 2)
    return band === middle ? [gap(scale), WELL_DOT, gap(width - scale - 1)] : [gap(width)]
  }
  if (code === FLASH) return [{ text: ' '.repeat(width), style: { backgroundColor: THEME.text } }]
  const kind = kindOf(code)
  if (!kind) return [gap(width)]
  if (isGhost(code)) return [{ text: '░'.repeat(width), style: { color: PIECE_COLORS[kind] } }]

  const face = { backgroundColor: PIECE_COLORS[kind] }
  if (scale === 1) return [{ text: ' '.repeat(width), style: face }]
  const edge = { backgroundColor: PIECE_EDGES[kind] }
  return band === scale - 1
    ? [{ text: ' '.repeat(width), style: edge }]
    : [{ text: ' '.repeat(width - 1), style: face }, { text: ' ', style: edge }]
}

// ── Half blocks: two board rows per line ──────────────────────────────────

type Paint = { color: string; solid: boolean }

function paint(code: string): Paint | null {
  if (code === EMPTY) return null
  if (code === FLASH) return { color: THEME.text, solid: true }
  const kind = kindOf(code)
  return kind ? { color: PIECE_COLORS[kind], solid: !isGhost(code) } : null
}

/** One cell holding an upper and a lower board cell; a ghost never paints over a block. */
function halfBlockCell(upper: string, lower: string): Span {
  const top = paint(upper)
  const bottom = paint(lower)
  if (top?.solid && bottom?.solid) {
    return top.color === bottom.color
      ? { text: '█', style: { color: top.color } }
      : { text: '▀', style: { color: top.color, backgroundColor: bottom.color } }
  }
  if (top?.solid) return { text: '▀', style: { color: top.color } }
  if (bottom?.solid) return { text: '▄', style: { color: bottom.color } }
  if (top && bottom) return { text: '█', style: { color: top.color, dimColor: true } }
  if (top) return { text: '▀', style: { color: top.color, dimColor: true } }
  if (bottom) return { text: '▄', style: { color: bottom.color, dimColor: true } }
  return gap(1)
}

function halfBlockLines(rows: readonly string[]): Line[] {
  const lines: Line[] = []
  for (let index = 0; index < rows.length; index += 2) {
    const upper = rows[index] ?? ''
    const lower = rows[index + 1] ?? ''
    lines.push(merge([...upper].map((code, x) => halfBlockCell(code, lower[x] ?? EMPTY))))
  }
  return lines
}

// ── Words over the well ───────────────────────────────────────────────────

function overlayFor(game: Game, best: number, roomy: boolean): Line[] {
  switch (game.phase) {
    case 'ready':
      return roomy
        ? [title(' '), [], text('SPACE  to start', THEME.text, true), [], text(CLICK_HINT, THEME.faint)]
        : [title(''), [], text('SPACE', THEME.text, true), text('to start', THEME.muted)]
    case 'paused':
      return roomy
        ? [
            text('PAUSED', THEME.accent, true),
            [],
            text('any key  resume', THEME.text),
            text('R  restart', THEME.muted),
            [],
            text(CLICK_HINT, THEME.faint),
          ]
        : [text('PAUSED', THEME.accent, true), text('any key', THEME.muted)]
    case 'over': {
      const isNewBest = game.score > best && game.score > 0
      const result = isNewBest ? text('NEW BEST ★', THEME.good, true) : text(`best ${formatNumber(best)}`, THEME.muted)
      return roomy
        ? [text('GAME OVER', THEME.bad, true), [], text(formatNumber(game.score), THEME.text, true), result, [], text('SPACE  play again', THEME.muted)]
        : [text('GAME OVER', THEME.bad, true), text(formatNumber(game.score), THEME.text, true), text('SPACE', THEME.muted)]
    }
    case 'playing':
      return []
  }
}

/** Replaces the middle lines of a well `width` cells wide with centred lines. */
function overlay(lines: Line[], words: readonly Line[], width: number): Line[] {
  if (words.length === 0) return lines
  const top = Math.max(0, Math.floor((lines.length - words.length) / 2))
  return lines.map((line, index) => {
    const word = words[index - top]
    return word ? centre(word, width) : line
  })
}
