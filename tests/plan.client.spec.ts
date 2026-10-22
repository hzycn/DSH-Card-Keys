import { describe, expect, it } from 'vitest'
import { NO_ACTION, planKey } from '../src/client/keyboard/plan.js'
import type { CardAction, KeyFacts } from '../src/client/keyboard/plan.js'

function facts(overrides: Partial<KeyFacts> = {}): KeyFacts {
  return {
    code: 'Digit2',
    region: 'page',
    modal: null,
    composing: false,
    defaultPrevented: false,
    repeat: false,
    control: false,
    alt: false,
    shift: false,
    meta: false,
    cardKind: 'question',
    optionCount: 3,
    focusInsideCard: false,
    focusIsControl: false,
    ...overrides,
  }
}

function action(overrides: Partial<KeyFacts> = {}): CardAction {
  return planKey(facts(overrides))
}

describe('question card keys', () => {
  it('selects an option by its number', () => {
    expect(action({ code: 'Digit1' })).toEqual({ type: 'selectOption', index: 0 })
    expect(action({ code: 'Digit3' })).toEqual({ type: 'selectOption', index: 2 })
  })

  it('ignores numbers beyond the visible options', () => {
    expect(action({ code: 'Digit4', optionCount: 3 })).toBe(NO_ACTION)
    expect(action({ code: 'Digit9', optionCount: 0 })).toBe(NO_ACTION)
  })

  it('moves focus with the arrow keys', () => {
    expect(action({ code: 'ArrowDown' })).toEqual({ type: 'moveFocus', delta: 1 })
    expect(action({ code: 'ArrowUp' })).toEqual({ type: 'moveFocus', delta: -1 })
    expect(action({ code: 'ArrowRight' })).toEqual({ type: 'moveFocus', delta: 1 })
    expect(action({ code: 'ArrowLeft' })).toEqual({ type: 'moveFocus', delta: -1 })
  })

  it('confirms with Enter when no control already owns it', () => {
    expect(action({ code: 'Enter' })).toEqual({ type: 'activate' })
    expect(action({ code: 'NumpadEnter' })).toEqual({ type: 'activate' })
    expect(action({ code: 'Enter', focusInsideCard: true, focusIsControl: true })).toBe(NO_ACTION)
  })

  it('closes the card with Escape', () => {
    expect(action({ code: 'Escape' })).toEqual({ type: 'dismiss' })
  })
})

describe('approval card keys', () => {
  it('answers with 1 allow once and 2 reject', () => {
    expect(action({ cardKind: 'approval', code: 'Digit1' })).toEqual({ type: 'approval', outcome: 'allow' })
    expect(action({ cardKind: 'approval', code: 'Digit2' })).toEqual({ type: 'approval', outcome: 'reject' })
  })

  it('never confirms an approval from outside the card and never dismisses it', () => {
    expect(action({ cardKind: 'approval', code: 'Enter' })).toBe(NO_ACTION)
    expect(action({ cardKind: 'approval', code: 'Escape' })).toBe(NO_ACTION)
    expect(action({ cardKind: 'approval', code: 'Digit3' })).toBe(NO_ACTION)
  })

  it('moves focus between the decision buttons with the arrows', () => {
    expect(action({ cardKind: 'approval', code: 'ArrowRight' })).toEqual({ type: 'moveFocus', delta: 1 })
    expect(action({ cardKind: 'approval', code: 'ArrowLeft' })).toEqual({ type: 'moveFocus', delta: -1 })
  })
})

describe('keys owned elsewhere keep their normal job', () => {
  it('declines while a text field, terminal, or modal owns the input', () => {
    expect(action({ region: 'editable' })).toBe(NO_ACTION)
    expect(action({ region: 'terminal' })).toBe(NO_ACTION)
    expect(action({ modal: 'settings' })).toBe(NO_ACTION)
  })

  it('declines modified, repeated, composing, or already-handled input', () => {
    expect(action({ shift: true })).toBe(NO_ACTION)
    expect(action({ control: true })).toBe(NO_ACTION)
    expect(action({ alt: true })).toBe(NO_ACTION)
    expect(action({ meta: true })).toBe(NO_ACTION)
    expect(action({ repeat: true })).toBe(NO_ACTION)
    expect(action({ composing: true })).toBe(NO_ACTION)
    expect(action({ defaultPrevented: true })).toBe(NO_ACTION)
  })

  it('leaves unrelated keys alone', () => {
    expect(action({ code: 'KeyA' })).toBe(NO_ACTION)
    expect(action({ code: 'Tab' })).toBe(NO_ACTION)
    expect(action({ code: 'Digit0' })).toBe(NO_ACTION)
  })
})
