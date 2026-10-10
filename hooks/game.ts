// Pure Tetris rules: every function takes a Game and returns the next one.
// A Game is plain JSON so it can be posted to the hooks module and saved.

export type PieceKind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'
export type Rotation = 0 | 1 | 2 | 3
export type Piece = { kind: PieceKind; rot: Rotation; x: number; y: number }
export type Phase = 'ready' | 'playing' | 'paused' | 'over'
export type Banner = { title: string; detail: string; ms: number }

export type Game = {
  /** HIDDEN_ROWS + VISIBLE_ROWS strings of COLS chars: EMPTY or a PieceKind. */
  board: string[]
  piece: Piece | null
  hold: PieceKind | null
  canHold: boolean
  queue: PieceKind[]
  seed: number
  score: number
  lines: number
  level: number
  /** Consecutive clearing locks minus one; -1 when the last lock cleared nothing. */
  combo: number
  backToBack: boolean
  phase: Phase
  fallMs: number
  lockMs: number
  lockResets: number
  /** Board rows flashing before they collapse; empty when none. */
  clearing: number[]
  clearMs: number
  banner: Banner | null
  /** Bumped on every change a drawing shows, so callers redraw only then. */
  rev: number
}

export const KINDS: readonly PieceKind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
export const COLS = 10
export const VISIBLE_ROWS = 20
export const HIDDEN_ROWS = 2
export const TOTAL_ROWS = HIDDEN_ROWS + VISIBLE_ROWS
export const EMPTY = '.'
export const GHOST = { I: 'i', O: 'o', T: 't', S: 's', Z: 'z', J: 'j', L: 'l' } as const
export const FLASH = '*'
export const CLEAR_MS = 220
export const LOCK_DELAY_MS = 500

const EMPTY_ROW = EMPTY.repeat(COLS)
const MAX_LOCK_RESETS = 15
const BANNER_MS = 1400
const LINES_PER_LEVEL = 10
const MAX_LEVEL = 20
const QUEUE_MIN = 7

type Cell = readonly [x: number, y: number]
type Cells = readonly Cell[]
type KickTable = Record<Rotation, { cw: Cells; ccw: Cells }>

// Spawn orientation of each piece inside its rotation box (x right, y down).
const SHAPES: Record<PieceKind, { size: number; cells: readonly Cell[] }> = {
  I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
}

const ROTATIONS = buildRotations()

// SRS wall kicks from each rotation, clockwise and counter-clockwise, written
// as the guideline does (y up); applied as y down.
const JLSTZ_KICKS: KickTable = {
  0: { cw: [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], ccw: [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]] },
  1: { cw: [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], ccw: [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]] },
  2: { cw: [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], ccw: [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]] },
  3: { cw: [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], ccw: [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]] },
}
const I_KICKS: KickTable = {
  0: { cw: [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], ccw: [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]] },
  1: { cw: [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], ccw: [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]] },
  2: { cw: [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], ccw: [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]] },
  3: { cw: [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], ccw: [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]] },
}
const NO_KICKS: Cells = [[0, 0]]

function buildRotations(): Record<PieceKind, readonly [Cells, Cells, Cells, Cells]> {
  const turn = (cells: Cells, size: number): Cells => cells.map(([x, y]) => [size - 1 - y, x] as const)
  const table = {} as Record<PieceKind, readonly [Cells, Cells, Cells, Cells]>
  for (const kind of KINDS) {
    const { size, cells } = SHAPES[kind]
    const right = turn(cells, size)
    const flipped = turn(right, size)
    table[kind] = [cells, right, flipped, turn(flipped, size)]
  }
  return table
}

function kicksFor(kind: PieceKind, from: Rotation, direction: -1 | 1): Cells {
  if (kind === 'O') return NO_KICKS
  const table = kind === 'I' ? I_KICKS : JLSTZ_KICKS
  return direction === 1 ? table[from].cw : table[from].ccw
}

function clearReward(cleared: number): { points: number; name: string } {
  switch (cleared) {
    case 1:
      return { points: 100, name: 'SINGLE' }
    case 2:
      return { points: 300, name: 'DOUBLE' }
    case 3:
      return { points: 500, name: 'TRIPLE' }
    default:
      return { points: 800, name: 'TETRIS!' }
  }
}

/** mulberry32: a small seeded generator, so a saved game keeps its sequence. */
function random(seed: number): [value: number, seed: number] {
  const next = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(next ^ (next >>> 15), next | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next]
}

/** Tops the queue up with shuffled bags of all seven pieces (the 7-bag randomizer). */
function refill(queue: readonly PieceKind[], seed: number): { queue: PieceKind[]; seed: number } {
  const next = [...queue]
  let state = seed
  while (next.length < QUEUE_MIN) {
    const pool = [...KINDS]
    while (pool.length > 0) {
      const [value, after] = random(state)
      state = after
      next.push(...pool.splice(Math.floor(value * pool.length), 1))
    }
  }
  return { queue: next, seed: state }
}

/** The queue's head; refill keeps it at least QUEUE_MIN long, so it is never empty. */
function head(queue: readonly PieceKind[]): PieceKind {
  const [kind] = queue
  if (kind === undefined) throw new Error('Tetris: the piece queue is empty')
  return kind
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`
}

export function cellsOf(piece: Piece): Cell[] {
  return ROTATIONS[piece.kind][piece.rot].map(([x, y]) => [piece.x + x, piece.y + y] as const)
}

/** The spawn orientation trimmed to its own rows, for previews. */
export function previewCells(kind: PieceKind): readonly Cell[] {
  const cells = SHAPES[kind].cells
  const top = Math.min(...cells.map(([, y]) => y))
  return cells.map(([x, y]) => [x, y - top] as const)
}

export function fits(board: readonly string[], piece: Piece): boolean {
  return cellsOf(piece).every(([x, y]) => x >= 0 && x < COLS && board[y]?.[x] === EMPTY)
}

function dropY(board: readonly string[], piece: Piece): number {
  let y = piece.y
  while (fits(board, { ...piece, y: y + 1 })) y += 1
  return y
}

function isGrounded(board: readonly string[], piece: Piece): boolean {
  return !fits(board, { ...piece, y: piece.y + 1 })
}

export function gravityMs(level: number): number {
  return Math.max(1, Math.round(1000 * Math.pow(0.8 - (level - 1) * 0.007, level - 1)))
}

export function createGame(seed: number): Game {
  const filled = refill([], seed | 0)
  return {
    board: Array.from({ length: TOTAL_ROWS }, () => EMPTY_ROW),
    piece: null,
    hold: null,
    canHold: true,
    queue: filled.queue,
    seed: filled.seed,
    score: 0,
    lines: 0,
    level: 1,
    combo: -1,
    backToBack: false,
    phase: 'ready',
    fallMs: 0,
    lockMs: 0,
    lockResets: 0,
    clearing: [],
    clearMs: 0,
    banner: null,
    rev: 0,
  }
}

/** Puts `kind` at the top; the game is over when it has no room there. */
function spawn(game: Game, kind: PieceKind): Game {
  const placed: Piece = { kind, rot: 0, x: kind === 'O' ? 4 : 3, y: 0 }
  const base = { ...game, fallMs: 0, lockMs: 0, lockResets: 0, rev: game.rev + 1 }
  if (!fits(game.board, placed)) return { ...base, piece: null, phase: 'over' }
  const lowered = { ...placed, y: 1 }
  return { ...base, piece: fits(game.board, lowered) ? lowered : placed }
}

function spawnNext(game: Game): Game {
  const kind = head(game.queue)
  const filled = refill(game.queue.slice(1), game.seed)
  return spawn({ ...game, queue: filled.queue, seed: filled.seed, canHold: true }, kind)
}

function isActive(game: Game): game is Game & { piece: Piece } {
  return game.phase === 'playing' && game.piece !== null && game.clearing.length === 0
}

export function start(game: Game): Game {
  return game.phase === 'ready' ? spawnNext({ ...game, phase: 'playing' }) : game
}

export function pause(game: Game): Game {
  return game.phase === 'playing' ? { ...game, phase: 'paused', rev: game.rev + 1 } : game
}

export function resume(game: Game): Game {
  return game.phase === 'paused' ? { ...game, phase: 'playing', rev: game.rev + 1 } : game
}

/** A moved or rotated piece; on the ground it buys more lock delay, up to a limit. */
function shifted(game: Game, piece: Piece): Game {
  const resets = isGrounded(game.board, piece) && game.lockResets < MAX_LOCK_RESETS
  return {
    ...game,
    piece,
    lockMs: resets ? 0 : game.lockMs,
    lockResets: resets ? game.lockResets + 1 : game.lockResets,
    rev: game.rev + 1,
  }
}

export function move(game: Game, dx: -1 | 1): Game {
  if (!isActive(game)) return game
  const piece = { ...game.piece, x: game.piece.x + dx }
  return fits(game.board, piece) ? shifted(game, piece) : game
}

export function rotate(game: Game, direction: -1 | 1): Game {
  if (!isActive(game)) return game
  const from = game.piece.rot
  const to = ((from + direction + 4) % 4) as Rotation
  for (const [kx, ky] of kicksFor(game.piece.kind, from, direction)) {
    const piece = { ...game.piece, rot: to, x: game.piece.x + kx, y: game.piece.y - ky }
    if (fits(game.board, piece)) return shifted(game, piece)
  }
  return game
}

export function softDrop(game: Game): Game {
  if (!isActive(game)) return game
  const piece = { ...game.piece, y: game.piece.y + 1 }
  if (!fits(game.board, piece)) return game
  return { ...game, piece, score: game.score + 1, fallMs: 0, lockResets: 0, rev: game.rev + 1 }
}

export function hardDrop(game: Game): Game {
  if (!isActive(game)) return game
  const y = dropY(game.board, game.piece)
  return lock({ ...game, piece: { ...game.piece, y }, score: game.score + 2 * (y - game.piece.y) })
}

export function hold(game: Game): Game {
  if (!isActive(game) || !game.canHold) return game
  const held = game.piece.kind
  const next = game.hold === null ? spawnNext({ ...game, hold: held }) : spawn({ ...game, hold: held }, game.hold)
  return { ...next, canHold: false }
}

function lock(game: Game & { piece: Piece }): Game {
  const cells = cellsOf(game.piece)
  const kind = game.piece.kind
  const board = stamp(game.board, new Map(cells.map(([x, y]) => [cellKey(x, y), kind])))
  if (cells.every(([, y]) => y < HIDDEN_ROWS)) {
    return { ...game, board, piece: null, phase: 'over', rev: game.rev + 1 }
  }

  const clearing = board.flatMap((row, index) => (row.includes(EMPTY) ? [] : [index]))
  const cleared = clearing.length
  if (cleared === 0) return spawnNext({ ...game, board, piece: null, combo: -1 })

  const isTetris = cleared === 4
  const combo = game.combo + 1
  const lines = game.lines + cleared
  const level = Math.min(MAX_LEVEL, 1 + Math.floor(lines / LINES_PER_LEVEL))
  const reward = clearReward(cleared)
  const base = reward.points * game.level
  const points = (isTetris && game.backToBack ? Math.floor(base * 1.5) : base) + 50 * combo * game.level
  const details = [combo > 0 ? `COMBO ×${combo}` : '', level > game.level ? `LEVEL ${level}` : '']

  return {
    ...game,
    board,
    piece: null,
    clearing,
    clearMs: CLEAR_MS,
    score: game.score + points,
    lines,
    level,
    combo,
    backToBack: isTetris,
    banner: {
      title: isTetris && game.backToBack ? 'B2B TETRIS!' : reward.name,
      detail: details.filter(Boolean).join(' · '),
      ms: BANNER_MS,
    },
    rev: game.rev + 1,
  }
}

/** The board with `marks` (cell key → code) painted over it. */
function stamp(board: readonly string[], marks: ReadonlyMap<string, string>): string[] {
  return board.map((row, y) => [...row].map((code, x) => marks.get(cellKey(x, y)) ?? code).join(''))
}

function collapse(board: readonly string[], rows: readonly number[]): string[] {
  const kept = board.filter((_, index) => !rows.includes(index))
  return [...Array.from({ length: rows.length }, () => EMPTY_ROW), ...kept]
}

/** Advances the clock by `dt` milliseconds: banners, line clears, gravity, lock delay. */
export function tick(game: Game, dt: number): Game {
  if (game.phase !== 'playing') return game

  let next = game
  if (next.banner) {
    const ms = next.banner.ms - dt
    next = ms > 0 ? { ...next, banner: { ...next.banner, ms } } : { ...next, banner: null, rev: next.rev + 1 }
  }

  if (next.clearing.length > 0) {
    const clearMs = next.clearMs - dt
    if (clearMs > 0) return { ...next, clearMs }
    return spawnNext({ ...next, board: collapse(next.board, next.clearing), clearing: [], clearMs: 0 })
  }

  if (!next.piece) return next

  const interval = gravityMs(next.level)
  let piece = next.piece
  let fallMs = next.fallMs + dt
  let fell = false
  while (fallMs >= interval) {
    const lower = { ...piece, y: piece.y + 1 }
    if (!fits(next.board, lower)) {
      fallMs = 0
      break
    }
    piece = lower
    fallMs -= interval
    fell = true
  }

  const grounded = isGrounded(next.board, piece)
  const lockMs = grounded ? next.lockMs + dt : 0
  if (grounded && lockMs >= LOCK_DELAY_MS) return lock({ ...next, piece })

  return {
    ...next,
    piece,
    fallMs,
    lockMs,
    lockResets: fell ? 0 : next.lockResets,
    rev: fell ? next.rev + 1 : next.rev,
  }
}

/**
 * The visible rows as drawn: EMPTY, a PieceKind for a block, its GHOST letter
 * where the piece would land, FLASH for a row being cleared.
 */
export function visibleRows(game: Game): string[] {
  const marks = new Map<string, string>()
  if (game.piece && game.phase !== 'over') {
    const ghost = { ...game.piece, y: dropY(game.board, game.piece) }
    for (const [x, y] of cellsOf(ghost)) marks.set(cellKey(x, y), GHOST[game.piece.kind])
    for (const [x, y] of cellsOf(game.piece)) marks.set(cellKey(x, y), game.piece.kind)
  }
  const flash = FLASH.repeat(COLS)
  return stamp(game.board, marks)
    .map((row, index) => (game.clearing.includes(index) ? flash : row))
    .slice(HIDDEN_ROWS)
}

/**
 * A saved game picked up again: it must be mid-play with its piece still
 * fitting, and comes back paused with its queue topped up; otherwise null.
 */
export function resumeSaved(game: Game): Game | null {
  if (game.phase !== 'playing' && game.phase !== 'paused') return null
  if (game.piece && !fits(game.board, game.piece)) return null
  const filled = refill(game.queue, game.seed)
  return { ...game, queue: filled.queue, seed: filled.seed, phase: 'paused', rev: game.rev + 1 }
}
