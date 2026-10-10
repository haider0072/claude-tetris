// Draws a Game with the surface's elements: a wide layout (two cells per block)
// when the pane has room, a compact one (half-block glyphs) when it does not.
import type { ClientElements, RenderElement } from 'claude-code'
import { COLS, EMPTY, FLASH, VISIBLE_ROWS, previewCells, visibleRows } from './game.ts'
import type { Game, PieceKind } from './game.ts'
import { PIECE_COLORS, THEME, TITLE } from './palette.ts'

export type View = {
  game: Game
  /** The best score before this game. */
  best: number
  columns: number
  rows: number
}

type Style = { color?: string; backgroundColor?: string; dimColor?: true; bold?: true }
type Span = { text: string; style: Style }
type Line = Span[]

/** Room the wide layout needs: a 22×22 framed board beside an 18-column panel. */
const WIDE = { columns: 42, rows: 22 }
/** Below this many columns the compact panel goes under the board. */
const SIDE_BY_SIDE_COLUMNS = 28
const PANEL_WIDTH = 18
const WIDE_CELL = 2
const PREVIEW_CELLS = 4

/** Keys reach the board once it is clicked. */
const CLICK_HINT = 'click board first'
const HELP: readonly string[] = ['←→ move  ↑ turn', '↓ soft   ␣ drop', 'c hold   p pause']

export function draw(view: View, elements: ClientElements): RenderElement {
  const { Box } = elements
  const unmeasured = view.columns <= 0 || view.rows <= 0
  const wide = unmeasured || (view.columns >= WIDE.columns && view.rows >= WIDE.rows)
  const sideBySide = wide || view.columns >= SIDE_BY_SIDE_COLUMNS

  return (
    <Box flexDirection={sideBySide ? 'row' : 'column'} columnGap={2} rowGap={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={view.game.phase === 'playing' ? THEME.accent : THEME.muted}
      >
        {(wide ? wideBoard(view) : compactBoard(view)).map(line => renderLine(line, elements))}
      </Box>
      {wide ? widePanel(view, elements) : compactPanel(view, elements)}
    </Box>
  )
}

function renderLine(line: Line, elements: ClientElements): RenderElement {
  const { Text } = elements
  return <Text>{line.map(span => <Text {...span.style}>{span.text}</Text>)}</Text>
}

/** Joins neighbouring spans that look the same, so a row is a handful of elements. */
function merge(spans: readonly Span[]): Line {
  const line: Line = []
  for (const span of spans) {
    const last = line[line.length - 1]
    if (last && sameStyle(last.style, span.style)) last.text += span.text
    else line.push({ text: span.text, style: span.style })
  }
  return line
}

function sameStyle(a: Style, b: Style): boolean {
  return (
    a.color === b.color &&
    a.backgroundColor === b.backgroundColor &&
    a.dimColor === b.dimColor &&
    a.bold === b.bold
  )
}

function kindOf(code: string): PieceKind | null {
  const upper = code.toUpperCase()
  return upper in PIECE_COLORS ? (upper as PieceKind) : null
}

function isGhost(code: string): boolean {
  return code !== code.toUpperCase()
}

// ── Wide: every block is two cells, a dotted well behind ──────────────────

function wideCell(code: string): Span {
  if (code === EMPTY) return { text: ' ·', style: { color: THEME.faint, dimColor: true } }
  if (code === FLASH) return { text: '  ', style: { backgroundColor: THEME.text } }
  const kind = kindOf(code)
  if (!kind) return { text: '  ', style: {} }
  return isGhost(code)
    ? { text: '░░', style: { color: PIECE_COLORS[kind] } }
    : { text: '  ', style: { backgroundColor: PIECE_COLORS[kind] } }
}

function wideBoard(view: View): Line[] {
  const width = COLS * WIDE_CELL
  const rows = visibleRows(view.game).map(row => merge([...row].map(wideCell)))
  return overlay(rows, overlayFor(view, 'wide'), width)
}

function widePanel(view: View, elements: ClientElements): RenderElement {
  const { Box, Text } = elements
  const { game } = view
  const [next, ...later] = game.queue
  const best = Math.max(view.best, game.score)
  const isNewBest = game.score > view.best && game.score > 0

  return (
    <Box flexDirection="column" width={PANEL_WIDTH}>
      {renderLine(title(' '), elements)}
      <Box flexDirection="row" columnGap={2} marginTop={1}>
        <Box flexDirection="column">
          <Text color={THEME.muted}>NEXT</Text>
          {widePreview(next ?? null, false).map(line => renderLine(line, elements))}
        </Box>
        <Box flexDirection="column">
          <Text color={THEME.muted}>HOLD</Text>
          {widePreview(game.hold, !game.canHold).map(line => renderLine(line, elements))}
        </Box>
      </Box>
      {renderLine(merge(later.slice(0, 2).flatMap(kind => [...compactPreview(kind), gap(2)])), elements)}
      <Box flexDirection="column" marginTop={1}>
        <Text color={THEME.muted}>SCORE</Text>
        <Text bold>{formatNumber(game.score)}</Text>
      </Box>
      <Box flexDirection="row" columnGap={3} marginTop={1}>
        <Box flexDirection="column">
          <Text color={THEME.muted}>LEVEL</Text>
          <Text bold>{String(game.level)}</Text>
        </Box>
        <Box flexDirection="column">
          <Text color={THEME.muted}>LINES</Text>
          <Text bold>{String(game.lines)}</Text>
        </Box>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text color={THEME.muted}>BEST</Text>
        <Text bold color={isNewBest ? THEME.good : THEME.text}>
          {isNewBest ? `${formatNumber(best)} ★` : formatNumber(best)}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text bold color={THEME.warn}>{game.banner?.title ?? ' '}</Text>
        <Text color={THEME.muted}>{game.banner?.detail || ' '}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {HELP.map(line => <Text color={THEME.faint}>{line}</Text>)}
      </Box>
    </Box>
  )
}

/** A piece in two rows of two-cell blocks; dimmed while hold is spent. */
function widePreview(kind: PieceKind | null, dim: boolean): Line[] {
  const grid = previewGrid(kind)
  return grid.map(row =>
    merge(
      row.map(filled =>
        filled && kind
          ? { text: '  ', style: { backgroundColor: dim ? THEME.faint : PIECE_COLORS[kind] } }
          : gap(WIDE_CELL),
      ),
    ),
  )
}

// ── Compact: two board rows per line with half-block glyphs ───────────────

type Paint = { color: string; solid: boolean }

function paint(code: string): Paint | null {
  if (code === EMPTY) return null
  if (code === FLASH) return { color: THEME.text, solid: true }
  const kind = kindOf(code)
  return kind ? { color: PIECE_COLORS[kind], solid: !isGhost(code) } : null
}

/** One cell holding an upper and a lower board cell; a ghost never paints over a block. */
function compactCell(upper: string, lower: string): Span {
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

function compactBoard(view: View): Line[] {
  const rows = visibleRows(view.game)
  const lines: Line[] = []
  for (let index = 0; index < VISIBLE_ROWS; index += 2) {
    const upper = rows[index] ?? ''
    const lower = rows[index + 1] ?? ''
    lines.push(merge([...upper].map((code, x) => compactCell(code, lower[x] ?? EMPTY))))
  }
  return overlay(lines, overlayFor(view, 'compact'), COLS)
}

function compactPanel(view: View, elements: ClientElements): RenderElement {
  const { Box, Text } = elements
  const { game } = view
  const [next] = game.queue

  return (
    <Box flexDirection="column">
      {renderLine(title(''), elements)}
      {renderLine([label('NEXT '), ...compactPreview(next ?? null)], elements)}
      {renderLine([label('HOLD '), ...compactPreview(game.hold, !game.canHold)], elements)}
      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text color={THEME.muted}>SCORE </Text>
          <Text bold>{formatNumber(game.score)}</Text>
        </Text>
        <Text>
          <Text color={THEME.muted}>LV </Text>
          <Text bold>{String(game.level)}</Text>
          <Text color={THEME.muted}> LINES </Text>
          <Text bold>{String(game.lines)}</Text>
        </Text>
        <Text>
          <Text color={THEME.muted}>BEST </Text>
          <Text bold>{formatNumber(Math.max(view.best, game.score))}</Text>
        </Text>
      </Box>
      <Text bold color={THEME.warn}>{game.banner?.title ?? ' '}</Text>
    </Box>
  )
}

/** A piece in one line of half-block glyphs. */
function compactPreview(kind: PieceKind | null, dim = false): Span[] {
  const [upper = [], lower = []] = previewGrid(kind)
  const color = kind && !dim ? PIECE_COLORS[kind] : THEME.faint
  return upper.map((top, x) => {
    const bottom = lower[x] ?? false
    if (top && bottom) return { text: '█', style: { color } }
    if (top) return { text: '▀', style: { color } }
    if (bottom) return { text: '▄', style: { color } }
    return gap(1)
  })
}

// ── Shared pieces ─────────────────────────────────────────────────────────

/** Two rows of PREVIEW_CELLS flags: which cells of a piece's spawn shape are filled. */
function previewGrid(kind: PieceKind | null): boolean[][] {
  const grid = [0, 1].map(() => Array.from({ length: PREVIEW_CELLS }, () => false))
  if (!kind) return grid
  for (const [x, y] of previewCells(kind)) {
    const row = grid[y]
    if (row) row[x] = true
  }
  return grid
}

function gap(width: number): Span {
  return { text: ' '.repeat(width), style: {} }
}

function label(text: string): Span {
  return { text, style: { color: THEME.muted } }
}

function title(spacing: string): Line {
  return TITLE.map(([letter, kind], index) => ({
    text: index < TITLE.length - 1 ? letter + spacing : letter,
    style: { color: PIECE_COLORS[kind], bold: true },
  }))
}

type Density = 'wide' | 'compact'

/** The words drawn over the well while the game waits, rests or ends. */
function overlayFor(view: View, density: Density): Line[] {
  const { game } = view
  const wide = density === 'wide'
  switch (game.phase) {
    case 'ready':
      return wide
        ? [title(' '), [], text('SPACE  to start', THEME.text, true), [], text(CLICK_HINT, THEME.faint)]
        : [title(''), [], text('SPACE', THEME.text, true), text('to start', THEME.muted)]
    case 'paused':
      return wide
        ? [
            text('PAUSED', THEME.accent, true),
            [],
            text('P  resume', THEME.text),
            text('R  restart', THEME.muted),
            [],
            text(CLICK_HINT, THEME.faint),
          ]
        : [text('PAUSED', THEME.accent, true), text('P resume', THEME.muted)]
    case 'over': {
      const isNewBest = game.score > view.best && game.score > 0
      const result = isNewBest ? text('NEW BEST ★', THEME.good, true) : text(`best ${formatNumber(view.best)}`, THEME.muted)
      return wide
        ? [text('GAME OVER', THEME.bad, true), [], text(formatNumber(game.score), THEME.text, true), result, [], text('SPACE  play again', THEME.muted)]
        : [text('GAME OVER', THEME.bad, true), text(formatNumber(game.score), THEME.text, true), text('SPACE', THEME.muted)]
    }
    case 'playing':
      return []
  }
}

function text(value: string, color: string, bold = false): Line {
  return [{ text: value, style: bold ? { color, bold: true } : { color } }]
}

/** Replaces the middle rows of a well `width` cells wide with centred lines. */
function overlay(rows: Line[], lines: readonly Line[], width: number): Line[] {
  if (lines.length === 0) return rows
  const top = Math.max(0, Math.floor((rows.length - lines.length) / 2))
  return rows.map((row, index) => {
    const line = lines[index - top]
    return line ? centre(line, width) : row
  })
}

function centre(line: Line, width: number): Line {
  const length = line.reduce((total, span) => total + span.text.length, 0)
  const left = Math.max(0, Math.floor((width - length) / 2))
  const right = Math.max(0, width - length - left)
  return [gap(left), ...line, gap(right)]
}

function formatNumber(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
