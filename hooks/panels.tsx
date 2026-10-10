// Score, previews and keys around the well: a side panel, a header above it,
// or a compact panel for a small pane.
import type { ClientElements, RenderElement } from 'claude-code'
import { previewCells } from './game.ts'
import type { Game, PieceKind } from './game.ts'
import { PIECE_COLORS, THEME } from './palette.ts'
import { centre, formatNumber, gap, label, merge, spread, title, value } from './spans.ts'
import type { Line, Span } from './spans.ts'

export type Scores = { game: Game; best: number }

/** The side panel's room. */
export const SIDE_PANEL = { width: 18, rows: 22 }
/** The header's room above a well. */
export const HEADER = { width: 36, rows: 5 }
/** The compact panel's room. */
export const COMPACT_PANEL = { width: 14, rows: 8 }

const PREVIEW_CELLS = 4
/** Room for a preview's label: `NEXT ` or `HOLD `. */
const PREVIEW_LABEL_WIDTH = 5
const PREVIEW_GAP = 2
const SIDE_HELP: readonly string[] = ['←→ move  ↑ turn', '↓ soft   ␣ drop', 'c hold   p pause']
const FOOTER_HELP: readonly string[] = ['←→ move  ↑ rotate  ↓ soft  ␣ drop', 'c hold   p pause   r restart']

/** The keys' lines under a well. */
export const FOOTER_LINES = FOOTER_HELP.length

export function renderLine(line: Line, elements: ClientElements): RenderElement {
  const { Text } = elements
  return <Text>{line.map(span => <Text {...span.style}>{span.text}</Text>)}</Text>
}

function bestOf({ game, best }: Scores): { text: string; color: string } {
  const isNewBest = game.score > best && game.score > 0
  return isNewBest
    ? { text: `${formatNumber(game.score)} ★`, color: THEME.good }
    : { text: formatNumber(Math.max(best, game.score)), color: THEME.text }
}

/** Title, previews, score and keys in an 18-column column beside the well. */
export function sidePanel(scores: Scores, elements: ClientElements): RenderElement {
  const { Box, Text } = elements
  const { game } = scores
  const [next, ...later] = game.queue
  const best = bestOf(scores)

  return (
    <Box flexDirection="column" width={SIDE_PANEL.width}>
      {renderLine(title(' '), elements)}
      <Box flexDirection="row" columnGap={2} marginTop={1}>
        <Box flexDirection="column">
          <Text color={THEME.muted}>NEXT</Text>
          {blockPreview(next ?? null, false).map(line => renderLine(line, elements))}
        </Box>
        <Box flexDirection="column">
          <Text color={THEME.muted}>HOLD</Text>
          {blockPreview(game.hold, !game.canHold).map(line => renderLine(line, elements))}
        </Box>
      </Box>
      {renderLine(merge(later.slice(0, 2).flatMap(kind => [...halfBlockPreview(kind), gap(2)])), elements)}
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
        <Text bold color={best.color}>{best.text}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text bold color={THEME.warn}>{game.banner?.title ?? ' '}</Text>
        <Text color={THEME.muted}>{game.banner?.detail || ' '}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {SIDE_HELP.map(line => <Text color={THEME.faint}>{line}</Text>)}
      </Box>
    </Box>
  )
}

/** HEADER.rows lines `width` wide: title and best, score, two lines of previews, the latest clear. */
export function headerLines(scores: Scores, width: number): Line[] {
  const { game } = scores
  const [first, second] = game.queue
  const best = bestOf(scores)
  const next = previewRows('NEXT', [first ?? null, second ?? null], false)
  const held = previewRows('HOLD', [game.hold], !game.canHold)
  return [
    spread(title(' '), [label('BEST '), value(best.text, best.color)], width),
    spread(
      [label('SCORE '), value(formatNumber(game.score))],
      [label('LV '), value(String(game.level)), gap(2), label('LINES '), value(String(game.lines))],
      width,
    ),
    ...next.map((line, row) => spread(line, held[row] ?? [], width)),
    game.banner
      ? centre([value(game.banner.title, THEME.warn), gap(2), label(game.banner.detail)], width)
      : [gap(width)],
  ].map(merge)
}

/** A label, then pieces side by side in two-cell blocks: two lines. */
function previewRows(name: string, kinds: readonly (PieceKind | null)[], dim: boolean): Line[] {
  const previews = kinds.map(kind => blockPreview(kind, dim))
  return [0, 1].map(row => [
    row === 0 ? label(name.padEnd(PREVIEW_LABEL_WIDTH)) : gap(PREVIEW_LABEL_WIDTH),
    ...previews.flatMap((lines, index) => [...(index > 0 ? [gap(PREVIEW_GAP)] : []), ...(lines[row] ?? [])]),
  ])
}

/** The keys, centred under a well `width` cells wide. */
export function footerLines(width: number): Line[] {
  return FOOTER_HELP.map(line => centre([{ text: line, style: { color: THEME.faint } }], width))
}

/** Title, previews and score for a small pane. */
export function compactPanel(scores: Scores, elements: ClientElements): RenderElement {
  const { Box } = elements
  const { game } = scores
  const [next] = game.queue

  return (
    <Box flexDirection="column">
      {renderLine(title(''), elements)}
      {renderLine([label('NEXT '), ...halfBlockPreview(next ?? null)], elements)}
      {renderLine([label('HOLD '), ...halfBlockPreview(game.hold, !game.canHold)], elements)}
      <Box flexDirection="column" marginTop={1}>
        {renderLine([label('SCORE '), value(formatNumber(game.score))], elements)}
        {renderLine([label('LV '), value(String(game.level)), label(' LINES '), value(String(game.lines))], elements)}
        {renderLine([label('BEST '), value(formatNumber(Math.max(scores.best, game.score)))], elements)}
      </Box>
      {renderLine([value(game.banner?.title ?? ' ', THEME.warn)], elements)}
    </Box>
  )
}

/** A piece in two lines of two-cell blocks; dimmed while hold is spent. */
function blockPreview(kind: PieceKind | null, dim: boolean): Line[] {
  return previewGrid(kind).map(row =>
    merge(
      row.map(filled =>
        filled && kind ? { text: '  ', style: { backgroundColor: dim ? THEME.faint : PIECE_COLORS[kind] } } : gap(2),
      ),
    ),
  )
}

/** A piece in one line of half-block glyphs. */
function halfBlockPreview(kind: PieceKind | null, dim = false): Span[] {
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
