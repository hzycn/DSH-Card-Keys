/** Pure key decision: one arbitrated input plus the mounted card state → one card action.
 *
 * Nothing here touches the DOM, so the whole keyboard contract is unit-testable. The
 * caller resolves the facts from the live document and performs the action. */

export type CardKind = 'question' | 'approval'

/** The action a card performs for one input, or `none` when the key keeps its normal job. */
export type CardAction =
  | { readonly type: 'selectOption'; readonly index: number }
  | { readonly type: 'approval'; readonly outcome: 'allow' | 'reject' }
  | { readonly type: 'moveFocus'; readonly delta: 1 | -1 }
  | { readonly type: 'toggleOption' }
  | { readonly type: 'activate' }
  | { readonly type: 'dismiss' }
  | { readonly type: 'none' }

export const NO_ACTION: CardAction = { type: 'none' }

/** Everything the decision needs, already resolved from the live document. */
export interface KeyFacts {
  readonly code: string
  readonly region: 'page' | 'editable' | 'terminal'
  readonly modal: string | null
  readonly composing: boolean
  readonly defaultPrevented: boolean
  readonly repeat: boolean
  readonly control: boolean
  readonly alt: boolean
  readonly shift: boolean
  readonly meta: boolean
  readonly cardKind: CardKind
  /** Selectable option buttons the card currently shows (question cards only). */
  readonly optionCount: number
  /** Whether the question on screen accepts several answers. */
  readonly multiSelect: boolean
  /** Whether focus is inside the card element. */
  readonly focusInsideCard: boolean
  /** Whether focus is on a control that already handles the key itself. */
  readonly focusIsControl: boolean
}

/**
 * Decide what one arbitrated input means for the mounted card.
 *
 * Number keys select, arrows move focus, Enter confirms, Escape dismisses. The decision
 * declines whenever the browser or a local control already owns the key: text fields,
 * modals, IME composition, modifiers, repeats, and events the card already handled.
 *
 * @param facts - the arbitrated gesture plus the mounted card's shape.
 * @returns the action to perform, or `NO_ACTION` to leave the key alone.
 */
export function planKey(facts: KeyFacts): CardAction {
  if (facts.defaultPrevented || facts.composing || facts.repeat) return NO_ACTION
  if (facts.control || facts.alt || facts.meta || facts.shift) return NO_ACTION
  if (facts.modal !== null) return NO_ACTION
  // A focused text field or terminal owns every key, digits included.
  if (facts.region !== 'page') return NO_ACTION

  const digit = digitFromCode(facts.code)
  if (digit !== null) {
    if (facts.cardKind === 'question') {
      return digit < facts.optionCount ? { type: 'selectOption', index: digit } : NO_ACTION
    }
    // Approval cards answer immediately: 1 allows once, 2 rejects. Never auto-allow
    // beyond the keys the user actually pressed.
    if (digit === 0) return { type: 'approval', outcome: 'allow' }
    if (digit === 1) return { type: 'approval', outcome: 'reject' }
    return NO_ACTION
  }

  if (facts.code === 'ArrowDown' || facts.code === 'ArrowRight') return { type: 'moveFocus', delta: 1 }
  if (facts.code === 'ArrowUp' || facts.code === 'ArrowLeft') return { type: 'moveFocus', delta: -1 }

  // Space toggles the option the ring is on, in a multi-select question. The arrows only move
  // the ring there — toggling while moving would check every option browsed over — so this is
  // how the user deliberately picks. A single-answer question needs no toggle: its option is
  // chosen the moment the ring lands on it.
  //
  // This deliberately ignores `focusIsControl`: that guard exists so a control which already
  // handles a key does not also get the plugin's action, but these option buttons only listen
  // for Enter. Leaving Space to the browser's native button activation would make the key
  // behave differently depending on whether focus happens to sit on an option, and the plugin
  // could not report whether the toggle happened.
  if (facts.code === 'Space' && facts.cardKind === 'question' && facts.multiSelect) {
    return { type: 'toggleOption' }
  }

  if (facts.code === 'Enter' || facts.code === 'NumpadEnter') {
    // An approval grants a tool permission: only the focused card may confirm it.
    if (facts.cardKind === 'approval') return NO_ACTION
    // A focused control already handles Enter (option buttons submit, the answer
    // field advances); never double-fire.
    if (facts.focusInsideCard && facts.focusIsControl) return NO_ACTION
    return { type: 'activate' }
  }

  if (facts.code === 'Escape' && facts.cardKind === 'question') return { type: 'dismiss' }
  return NO_ACTION
}

const DIGIT_PATTERN = /^Digit([1-9])$/u

/** Digit gesture code → 0-based index, or null for anything else. */
export function digitFromCode(code: string): number | null {
  const match = DIGIT_PATTERN.exec(code)
  return match === null ? null : Number(match[1]) - 1
}
