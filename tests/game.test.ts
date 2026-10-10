import { describe, expect, test } from 'claude-code/testing'
import {
  CLEAR_MS,
  COLS,
  EMPTY,
  KINDS,
  LOCK_DELAY_MS,
  TOTAL_ROWS,
  createGame,
  gravityMs,
  hardDrop,
  hold,
  move,
  pause,
  resume,
  rotate,
  softDrop,
  start,
  tick,
  visibleRows,
} from '../hooks/game.ts'
import type { Game, Piece } from '../hooks/game.ts'
import { restore } from '../hooks/save.ts'

const EMPTY_ROW = EMPTY.repeat(COLS)

/** A started game with `piece` in play over the given bottom rows. */
function withBoard(bottom: readonly string[], piece: Piece, overrides: Partial<Game> = {}): Game {
  const board = [...Array.from({ length: TOTAL_ROWS - bottom.length }, () => EMPTY_ROW), ...bottom]
  return { ...start(createGame(7)), board, piece, ...overrides }
}

/** Four rows full but for the last column: an upright I there clears them all. */
const TETRIS_READY = Array.from({ length: 4 }, () => 'JJJJJJJJJ.')
const UPRIGHT_I_IN_LAST_COLUMN: Piece = { kind: 'I', rot: 1, x: 7, y: 0 }

describe('a new game', () => {
  test('waits to start with a full 7-bag queued', () => {
    const game = createGame(42)
    expect(game.phase).toBe('ready')
    expect(game.piece).toBe(null)
    expect([...game.queue.slice(0, 7)].sort()).toEqual([...KINDS].sort())
  })

  test('spawns the queue head at the top when started', () => {
    const ready = createGame(42)
    const game = start(ready)
    expect(game.phase).toBe('playing')
    expect(game.piece?.kind).toBe(ready.queue[0])
    expect(visibleRows(game)[0]).toMatch(/[IOTSZJL]/)
  })

  test('the same seed deals the same pieces', () => {
    expect(createGame(9).queue).toEqual(createGame(9).queue)
  })
})

describe('moving and rotating', () => {
  test('a piece stops at the wall', () => {
    let game = withBoard([], { kind: 'O', rot: 0, x: 4, y: 5 })
    for (let step = 0; step < 10; step += 1) game = move(game, -1)
    expect(game.piece?.x).toBe(0)
  })

  test('a T against the left wall kicks out when turned', () => {
    const game = withBoard([], { kind: 'T', rot: 1, x: -1, y: 5 })
    const turned = rotate(game, -1)
    expect(turned.piece?.rot).toBe(0)
    expect(turned.piece?.x).toBe(0)
  })

  test('an I turns both ways and back', () => {
    const game = withBoard([], { kind: 'I', rot: 0, x: 3, y: 5 })
    expect(rotate(rotate(game, 1), -1).piece).toEqual(game.piece)
  })

  test('soft drop moves down a row and scores one', () => {
    const game = withBoard([], { kind: 'O', rot: 0, x: 4, y: 5 })
    const dropped = softDrop(game)
    expect(dropped.piece?.y).toBe(6)
    expect(dropped.score).toBe(game.score + 1)
  })
})

describe('dropping and clearing', () => {
  test('hard drop locks at the floor, scores two a row and deals the next piece', () => {
    const game = withBoard([], { kind: 'O', rot: 0, x: 4, y: 2 })
    const dropped = hardDrop(game)
    expect(dropped.board[TOTAL_ROWS - 1]).toBe('....OO....')
    expect(dropped.score).toBe(2 * (TOTAL_ROWS - 2 - 2))
    expect(dropped.piece?.kind).toBe(game.queue[0])
  })

  test('four lines are a TETRIS: they flash, then collapse', () => {
    const game = withBoard(TETRIS_READY, UPRIGHT_I_IN_LAST_COLUMN)
    const dropped = hardDrop(game)
    expect(dropped.clearing).toHaveLength(4)
    expect(dropped.banner?.title).toBe('TETRIS!')
    expect(dropped.lines).toBe(4)
    expect(visibleRows(dropped).at(-1)).toBe('**********')

    const cleared = tick(dropped, CLEAR_MS)
    expect(cleared.clearing).toEqual([])
    expect(cleared.board.every(row => row === EMPTY_ROW)).toBe(true)
    expect(cleared.piece).not.toBe(null)
  })

  test('a second TETRIS in a row scores half again', () => {
    const plain = hardDrop(withBoard(TETRIS_READY, UPRIGHT_I_IN_LAST_COLUMN))
    const backToBack = hardDrop(withBoard(TETRIS_READY, UPRIGHT_I_IN_LAST_COLUMN, { backToBack: true }))
    const drop = plain.score - 800
    expect(backToBack.score - drop).toBe(1200)
    expect(backToBack.banner?.title).toBe('B2B TETRIS!')
  })

  test('ten lines raise the level', () => {
    const game = hardDrop(withBoard(TETRIS_READY, UPRIGHT_I_IN_LAST_COLUMN, { lines: 8 }))
    expect(game.level).toBe(2)
    expect(game.banner?.detail).toContain('LEVEL 2')
  })
})

describe('hold', () => {
  test('swaps the piece out once per piece', () => {
    const game = withBoard([], { kind: 'T', rot: 0, x: 3, y: 5 })
    const held = hold(game)
    expect(held.hold).toBe('T')
    expect(held.piece?.kind).toBe(game.queue[0])
    expect(hold(held)).toBe(held)
  })
})

describe('the clock', () => {
  test('gravity pulls the piece down one row per interval', () => {
    const game = withBoard([], { kind: 'O', rot: 0, x: 4, y: 5 })
    expect(tick(game, gravityMs(1) - 1).piece?.y).toBe(5)
    expect(tick(game, gravityMs(1)).piece?.y).toBe(6)
  })

  test('a grounded piece locks after the lock delay', () => {
    const game = withBoard([], { kind: 'O', rot: 0, x: 4, y: TOTAL_ROWS - 2 })
    const waiting = tick(game, LOCK_DELAY_MS - 1)
    expect(waiting.piece?.y).toBe(TOTAL_ROWS - 2)
    const locked = tick(waiting, 1)
    expect(locked.board[TOTAL_ROWS - 1]).toBe('....OO....')
  })

  test('nothing moves while paused', () => {
    const paused = pause(withBoard([], { kind: 'O', rot: 0, x: 4, y: 5 }))
    expect(tick(paused, 5000)).toBe(paused)
    expect(resume(paused).phase).toBe('playing')
  })

  test('the game ends when a piece locks above the well', () => {
    const stack = Array.from({ length: TOTAL_ROWS - 2 }, (_, row) => (row % 2 ? 'ZZZZZ.ZZZZ' : 'ZZZZZZZZZ.'))
    const game = withBoard(stack, { kind: 'O', rot: 0, x: 0, y: 0 })
    expect(hardDrop(game).phase).toBe('over')
  })

  test('the game ends when the next piece has no room to spawn', () => {
    const spawnBlocked = ['...ZZZZ...', '...ZZZZ...', ...Array.from({ length: TOTAL_ROWS - 2 }, () => EMPTY_ROW)]
    const game = withBoard([], { kind: 'O', rot: 0, x: 0, y: TOTAL_ROWS - 2 }, { board: spawnBlocked })
    const over = tick(game, LOCK_DELAY_MS)
    expect(over.phase).toBe('over')
    expect(over.piece).toBe(null)
  })
})

describe('saved games', () => {
  test('a running game comes back paused', () => {
    const game = withBoard([], { kind: 'T', rot: 0, x: 3, y: 5 }, { score: 1234 })
    const restored = restore(JSON.parse(JSON.stringify(game)))
    expect(restored?.phase).toBe('paused')
    expect(restored?.score).toBe(1234)
    expect(restored?.piece).toEqual(game.piece)
  })

  test('anything malformed, unstarted or finished is dropped', () => {
    expect(restore(null)).toBe(null)
    expect(restore({ board: 'nope' })).toBe(null)
    expect(restore(createGame(1))).toBe(null)
    expect(restore({ ...start(createGame(1)), phase: 'over' })).toBe(null)
    expect(restore({ ...start(createGame(1)), board: ['XXXXXXXXXX'] })).toBe(null)
  })
})
