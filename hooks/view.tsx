// Draws a Game as big as the pane allows: the largest block size that fits,
// with the score beside the well, above it, or in a compact panel.
import type { ClientElements, RenderElement } from 'claude-code'
import { boardHeight, boardLines, boardWidth } from './board.ts'
import type { Scale } from './board.ts'
import { THEME } from './palette.ts'
import {
  COMPACT_PANEL,
  FOOTER_LINES,
  HEADER,
  SIDE_PANEL,
  compactPanel,
  footerLines,
  headerLines,
  renderLine,
  sidePanel,
} from './panels.tsx'
import type { Scores } from './panels.tsx'
import type { Line } from './spans.ts'

export type View = Scores & { columns: number; rows: number }

/**
 * Where the score goes: beside the well, in a header above it, or in a
 * compact panel beside or under a half-block well. A frameless well trades
 * its border for a floor line, for a pane a frame would not fit.
 */
export type Layout = {
  scale: Scale
  framed: boolean
  arrangement: 'side' | 'header' | 'compact'
  /** Whether the keys fit under the well. */
  footer: boolean
}

/** A round border's cells on each axis. */
const FRAME = 2
/** The floor line under a frameless well: its rows, and its glyph. */
const FLOOR = 1
const FLOOR_GLYPH = '▔'
const PANEL_GAP = 2
/** A blank line, then the keys. */
const FOOTER_ROWS = 1 + FOOTER_LINES
const BLOCK_SCALES: readonly Scale[] = [3, 2, 1]
/** Before the pane is measured: the layout that fits the docked pane. */
const UNMEASURED: Layout = { scale: 1, framed: true, arrangement: 'side', footer: false }

/** The biggest board that fits `columns` × `rows`, with a frame where there is room for one. */
export function layoutFor(columns: number, rows: number): Layout {
  if (columns <= 0 || rows <= 0) return UNMEASURED
  for (const scale of BLOCK_SCALES) {
    for (const framed of [true, false]) {
      const well = wellSize(scale, framed)
      if (columns >= well.width + PANEL_GAP + SIDE_PANEL.width && rows >= Math.max(well.height, SIDE_PANEL.rows)) {
        return { scale, framed, arrangement: 'side', footer: false }
      }
      const stacked = HEADER.rows + well.height
      if (columns >= Math.max(well.width, HEADER.width) && rows >= stacked) {
        return { scale, framed, arrangement: 'header', footer: rows >= stacked + FOOTER_ROWS }
      }
    }
  }
  return { scale: 0, framed: true, arrangement: 'compact', footer: false }
}

function wellSize(scale: Scale, framed: boolean): { width: number; height: number } {
  return framed
    ? { width: boardWidth(scale) + FRAME, height: boardHeight(scale) + FRAME }
    : { width: boardWidth(scale), height: boardHeight(scale) + FLOOR }
}

export function draw(view: View, elements: ClientElements): RenderElement {
  const { Box } = elements
  const layout = layoutFor(view.columns, view.rows)
  const well = drawWell(view, layout, elements)

  switch (layout.arrangement) {
    case 'side':
      return (
        <Box width="100%" flexDirection="row" justifyContent="center" columnGap={PANEL_GAP}>
          {well}
          {sidePanel(view, elements)}
        </Box>
      )
    case 'header': {
      const width = Math.max(wellSize(layout.scale, layout.framed).width, HEADER.width)
      return (
        <Box width="100%" flexDirection="column" alignItems="center">
          {renderLines(headerLines(view, width), elements)}
          {well}
          {layout.footer ? (
            <Box flexDirection="column" marginTop={1}>
              {renderLines(footerLines(width), elements)}
            </Box>
          ) : null}
        </Box>
      )
    }
    case 'compact': {
      const sideBySide = view.columns >= wellSize(0, true).width + PANEL_GAP + COMPACT_PANEL.width
      return (
        <Box flexDirection={sideBySide ? 'row' : 'column'} columnGap={PANEL_GAP} rowGap={1}>
          {well}
          {compactPanel(view, elements)}
        </Box>
      )
    }
  }
}

function drawWell(view: View, layout: Layout, elements: ClientElements): RenderElement {
  const { Box } = elements
  const lines = boardLines(view.game, view.best, layout.scale)
  if (!layout.framed) {
    const floor: Line = [{ text: FLOOR_GLYPH.repeat(boardWidth(layout.scale)), style: { color: THEME.muted } }]
    return <Box flexDirection="column">{renderLines([...lines, floor], elements)}</Box>
  }
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={view.game.phase === 'playing' ? THEME.accent : THEME.muted}
    >
      {renderLines(lines, elements)}
    </Box>
  )
}

function renderLines(lines: readonly Line[], elements: ClientElements): RenderElement[] {
  return lines.map(line => renderLine(line, elements))
}
