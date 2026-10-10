// Reads a saved game back from the store, field by field, so a damaged or
// foreign value never reaches the rules.
import { COLS, EMPTY, KINDS, TOTAL_ROWS, resumeSaved } from './game.ts'
import type { Banner, Game, Phase, Piece, PieceKind } from './game.ts'

const PHASES: readonly Phase[] = ['ready', 'playing', 'paused', 'over']

/** The saved game, paused, when it is well formed and mid-play; otherwise null. */
export function restore(saved: unknown): Game | null {
  return isGame(saved) ? resumeSaved(saved) : null
}

function isGame(value: unknown): value is Game {
  if (!isRecord(value)) return false
  const g = value
  return (
    Array.isArray(g.board) &&
    g.board.length === TOTAL_ROWS &&
    g.board.every(isBoardRow) &&
    (g.piece === null || isPiece(g.piece)) &&
    (g.hold === null || isKind(g.hold)) &&
    typeof g.canHold === 'boolean' &&
    Array.isArray(g.queue) &&
    g.queue.length > 0 &&
    g.queue.every(isKind) &&
    isWhole(g.seed) &&
    isWhole(g.score) &&
    isWhole(g.lines) &&
    isWhole(g.level) &&
    isWhole(g.combo) &&
    typeof g.backToBack === 'boolean' &&
    PHASES.includes(g.phase as Phase) &&
    isFiniteNumber(g.fallMs) &&
    isFiniteNumber(g.lockMs) &&
    isWhole(g.lockResets) &&
    Array.isArray(g.clearing) &&
    g.clearing.every(row => isWhole(row) && row >= 0 && row < TOTAL_ROWS) &&
    isFiniteNumber(g.clearMs) &&
    (g.banner === null || isBanner(g.banner)) &&
    isWhole(g.rev)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isWhole(value: unknown): value is number {
  return Number.isInteger(value)
}

function isKind(value: unknown): value is PieceKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value)
}

function isBoardRow(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.length === COLS &&
    [...value].every(char => char === EMPTY || isKind(char))
  )
}

function isPiece(value: unknown): value is Piece {
  return (
    isRecord(value) &&
    isKind(value.kind) &&
    [0, 1, 2, 3].includes(value.rot as number) &&
    isWhole(value.x) &&
    isWhole(value.y)
  )
}

function isBanner(value: unknown): value is Banner {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.detail === 'string' &&
    isFiniteNumber(value.ms)
  )
}
