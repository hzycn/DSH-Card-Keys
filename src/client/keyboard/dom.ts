/** DOM adapters over the official interaction cards.
 *
 * The plugin never replaces a card: it reads the shipped markup and performs ordinary
 * clicks and focus moves, so the official components stay the single presentation and
 * their own state machine (progress, countdown, review cards, remote access) is kept.
 *
 * Shipped hooks this module relies on, all owned by the official packages:
 * - `[data-question-key]` on the ask_user_question / plan-review takeover frame.
 * - `[data-approval-key]` on the approval takeover frame.
 * - `button[role="radio"|"checkbox"]` for selectable question options.
 * - `[data-question-scroll]` for the answer body and `footer` for the pager/actions. */

export type InteractionCard =
  | { readonly kind: 'question'; readonly element: HTMLElement }
  | { readonly kind: 'approval'; readonly element: HTMLElement }

const QUESTION_CARD = '[data-question-key]'
const APPROVAL_CARD = '[data-approval-key]'
const CONTROL = 'button, input, textarea, select, a[href], [contenteditable="true"], [contenteditable=""]'

/** A card that is really on screen; hidden or detached frames never take keys. */
function isLive(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false
  if (!element.isConnected) return false
  if (element.hidden) return false
  if (element.getAttribute('aria-hidden') === 'true') return false
  const view = element.ownerDocument.defaultView
  if (view === null) return true
  return view.getComputedStyle(element).display !== 'none'
}

function lastLive<T extends Element>(root: ParentNode, selector: string): T | null {
  const found = [...root.querySelectorAll<T>(selector)].filter(isLive)
  return found.at(-1) ?? null
}

/**
 * The interaction card that currently owns the keyboard, or null.
 *
 * An approval outranks a question: it is the more urgent decision and the one whose
 * digits mean allow/reject.
 *
 * @param root - document to inspect, defaulting to the live document.
 * @returns the topmost live card, or null when no interaction is on screen.
 */
export function activeCard(root: ParentNode = document): InteractionCard | null {
  const approval = lastLive<HTMLElement>(root, APPROVAL_CARD)
  if (approval !== null) return { kind: 'approval', element: approval }
  const question = lastLive<HTMLElement>(root, QUESTION_CARD)
  if (question !== null) return { kind: 'question', element: question }
  return null
}

function enabled<T extends HTMLElement>(elements: T[]): T[] {
  return elements.filter(element => (element as { readonly disabled?: boolean }).disabled !== true)
}

/** Selectable option buttons of a question card, in display order. */
export function optionButtons(card: HTMLElement): HTMLElement[] {
  return enabled([...card.querySelectorAll<HTMLElement>('button[role="radio"], button[role="checkbox"]')])
}

/** The approval card's decision buttons: the trailing action row is reject, then allow once. */
export function approvalButtons(card: HTMLElement): { allow?: HTMLElement; reject?: HTMLElement } {
  const buttons = enabled([...card.querySelectorAll<HTMLElement>('button')])
  const allow = buttons.at(-1)
  const reject = buttons.length >= 2 ? buttons.at(-2) : undefined
  return reject === undefined ? { allow } : { allow, reject }
}

/** The controls arrow keys traverse: the answer body first, then the footer actions. */
export function focusRing(card: InteractionCard): HTMLElement[] {
  if (card.kind === 'approval') return enabled([...card.element.querySelectorAll<HTMLElement>('button')])
  const ring: HTMLElement[] = []
  const body = card.element.querySelector('[data-question-scroll]')
  if (body !== null) ring.push(...enabled([...body.querySelectorAll<HTMLElement>(CONTROL)]))
  const footer = card.element.querySelector('footer')
  if (footer !== null) ring.push(...enabled([...footer.querySelectorAll<HTMLElement>(CONTROL)]))
  return ring
}

/** The card's confirming action: the last footer button, or the approval's allow button. */
export function primaryButton(card: InteractionCard): HTMLElement | undefined {
  if (card.kind === 'approval') return approvalButtons(card.element).allow
  const footer = card.element.querySelector('footer')
  if (footer === null) return undefined
  return enabled([...footer.querySelectorAll<HTMLElement>('button')]).at(-1)
}

/** The header close control (minimize is the first icon button, close is the last). */
export function dismissButton(card: HTMLElement): HTMLElement | undefined {
  const header = card.querySelector('header')
  if (header === null) return undefined
  return enabled([...header.querySelectorAll<HTMLElement>('button')]).at(-1)
}

/** Whether focus currently sits on a control that owns the key by itself. */
export function focusIsControl(active: Element | null): boolean {
  return active !== null && active.closest(CONTROL) !== null
}
