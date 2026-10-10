// Styled runs of text, the unit every drawn line is built from.
import { PIECE_COLORS, THEME, TITLE } from './palette.ts'

type Style = { color?: string; backgroundColor?: string; dimColor?: true; bold?: true }
export type Span = { text: string; style: Style }
export type Line = Span[]

/** Joins neighbouring spans that look the same, so a line is a handful of elements. */
export function merge(spans: readonly Span[]): Line {
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

function widthOf(line: Line): number {
  return line.reduce((total, span) => total + span.text.length, 0)
}

export function gap(width: number): Span {
  return { text: ' '.repeat(Math.max(0, width)), style: {} }
}

export function label(content: string): Span {
  return { text: content, style: { color: THEME.muted } }
}

export function value(content: string, color: string = THEME.text): Span {
  return { text: content, style: { color, bold: true } }
}

export function text(content: string, color: string, bold = false): Line {
  return [{ text: content, style: bold ? { color, bold: true } : { color } }]
}

/** T E T R I S in the pieces' colors, its letters `spacing` apart. */
export function title(spacing: string): Line {
  return TITLE.map(([letter, kind], index) => ({
    text: index < TITLE.length - 1 ? letter + spacing : letter,
    style: { color: PIECE_COLORS[kind], bold: true },
  }))
}

/** `line` padded to `width`, centred. */
export function centre(line: Line, width: number): Line {
  const left = Math.floor((width - widthOf(line)) / 2)
  return [gap(left), ...line, gap(width - widthOf(line) - left)]
}

/** `left` and `right` pushed to the two ends of `width`. */
export function spread(left: Line, right: Line, width: number): Line {
  return [...left, gap(width - widthOf(left) - widthOf(right)), ...right]
}

export function formatNumber(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
