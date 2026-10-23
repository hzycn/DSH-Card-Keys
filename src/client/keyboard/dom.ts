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

/**
 * How many questions the card currently holds, from its `n / total` pager label.
 *
 * The shipped card renders `index + 1` and the question count in a footer `span`. A batch of
 * more than one is the case where selecting an option also turns the page, so a caller can
 * tell "one question" from "the first of several".
 *
 * @param card - the `[data-question-key]` frame.
 * @returns the total question count, or 1 when the pager cannot be read.
 */
export function questionCount(card: HTMLElement): number {
  const footer = card.querySelector('footer')
  if (footer === null) return 1
  const match = /(\d+)\s*\/\s*(\d+)/u.exec(footer.textContent ?? '')
  if (match === null) return 1
  const total = Number(match[2])
  return Number.isFinite(total) && total > 0 ? total : 1
}

/**
 * Whether an element is a selectable option rather than a pager or answer field.
 *
 * The arrow ring walks the options and then the footer controls; only the options carry an
 * answer, so only they are selected while moving.
 *
 * @param element - a control inside the card.
 * @returns whether it is a radio or checkbox option button.
 */
export function isOption(element: Element): boolean {
  if (!(element instanceof HTMLElement) || element.tagName !== 'BUTTON') return false
  const role = element.getAttribute('role')
  return role === 'radio' || role === 'checkbox'
}

/**
 * Whether the question currently shown already carries an answer.
 *
 * The shipped card prefills a free-text draft and marks chosen options with `aria-checked`,
 * so either one means the user — or the model's own recommendation — already decided, and
 * a default must not overwrite it.
 *
 * @param card - the `[data-question-key]` frame.
 * @returns whether any option is checked or the custom answer has text.
 */
export function questionAnswered(card: HTMLElement): boolean {
  if (card.querySelector('button[role="radio"][aria-checked="true"], button[role="checkbox"][aria-checked="true"]') !== null) return true
  const custom = card.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-question-scroll] input, [data-question-scroll] textarea')
  return custom !== null && custom.value.trim() !== ''
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

/**
 * The card's confirming action: the trailing primary button.
 *
 * The footer ends with `Skip`, then the primary action (`Next` / `Submit`). The primary is
 * located by position, never by "the last enabled button": when nothing is selected the
 * shipped card disables the primary, and a last-enabled search would then fall through to
 * `Skip` — making `Enter` silently skip a question instead of doing nothing.
 *
 * @param card - the live interaction card.
 * @returns the primary button, or undefined when the card has none (or it is disabled).
 */
export function primaryButton(card: InteractionCard): HTMLElement | undefined {
  if (card.kind === 'approval') return approvalButtons(card.element).allow
  const footer = card.element.querySelector('footer')
  if (footer === null) return undefined
  const buttons = [...footer.querySelectorAll<HTMLElement>('button')]
  const primary = buttons.at(-1)
  if (primary === undefined) return undefined
  // A disabled primary must stay disabled: its own `disabled` state is the card's own answer
  // to "is this question complete yet", and calling click() would bypass it.
  if ((primary as { readonly disabled?: boolean }).disabled === true) return undefined
  return primary
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
