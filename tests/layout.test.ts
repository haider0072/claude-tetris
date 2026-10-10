import { describe, expect, test } from 'claude-code/testing'
import { layoutFor } from '../hooks/view.tsx'

describe('layoutFor', () => {
  test('an unmeasured pane gets the docked layout', () => {
    expect(layoutFor(0, 0)).toEqual({ scale: 1, framed: true, arrangement: 'side', footer: false })
  })

  test('the docked terminal pane fits a framed well and the side panel', () => {
    expect(layoutFor(44, 24)).toEqual({ scale: 1, framed: true, arrangement: 'side', footer: false })
  })

  test("the desktop app's tall pane trades the frame for bigger blocks, score above", () => {
    expect(layoutFor(40, 51)).toEqual({ scale: 2, framed: false, arrangement: 'header', footer: true })
  })

  test('a wide, tall pane gets big framed blocks beside the panel', () => {
    expect(layoutFor(70, 46)).toEqual({ scale: 2, framed: true, arrangement: 'side', footer: false })
    expect(layoutFor(90, 64)).toEqual({ scale: 3, framed: true, arrangement: 'side', footer: false })
  })

  test('the keys go under a stacked well only when they fit', () => {
    expect(layoutFor(42, 47)).toEqual({ scale: 2, framed: true, arrangement: 'header', footer: false })
    expect(layoutFor(42, 50)).toEqual({ scale: 2, framed: true, arrangement: 'header', footer: true })
  })

  test('a small pane falls back to half blocks', () => {
    expect(layoutFor(30, 14)).toEqual({ scale: 0, framed: true, arrangement: 'compact', footer: false })
  })
})
