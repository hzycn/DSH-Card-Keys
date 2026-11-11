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
 * - `[data-question-scroll]` for the answer body and `footer` for the pager/actions.
 *
 * The arrow ring is built from those hooks plus an explicit allowlist of controls the user
 * can actually answer with — never from "every button in the body". DSH 0.2.2 added
 * "expand copy" buttons inside `[data-question-scroll]` (a question-title toggle, always
 * rendered, and one per option description) hidden with `visibility: hidden`. A generic
 * body scan adopted them as ring stops, `focus()` on a hidden button is a silent no-op, and
 * every arrow key then appeared dead. Keeping the ring semantic is what makes the next piece
 * of card chrome harmless. */

export type InteractionCard =
  | { readonly kind: 'question'; readonly element: HTMLElement }
  | { readonly kind: 'approval'; readonly element: HTMLElement }

const QUESTION_CARD = '[data-question-key]'
const APPROVAL_CARD = '[data-approval-key]'
const CONTROL = 'button, input, textarea, select, a[href], [contenteditable="true"], [contenteditable=""]'

/** The two ways a question is answered: a selectable option, or a text field. */
const ANSWER_CONTROL = 'button[role="radio"], button[role="checkbox"], input, textarea, select, [contenteditable="true"], [contenteditable=""]'

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

/**
 * Whether the user could actually put the keyboard on this element right now.
 *
 * `focus()` on a `visibility: hidden` element is a silent no-op, and the arrow ring is
 * walked by focusing: a hidden stop therefore swallows every arrow key that lands on it.
 * DSH 0.2.2 renders exactly such buttons inside the answer body (the copy-expand toggles,
 * which are `visibility: hidden` until their text overflows), so every ring stop must be
 * proven visible before the user is asked to press a key. Ancestors matter: `display: none`
 * is not inherited, so it is checked by walking up; `visibility` is inherited, but the
 * walk covers both without relying on that.
 *
 * @param element - a control the ring might stop on.
 * @returns whether it is connected, shown, and not inside a hidden or inert subtree.
 */
export function isShown(element: HTMLElement): boolean {
  if (!element.isConnected) return false
  if (element.closest('[hidden], [inert]') !== null) return false
  const view = element.ownerDocument.defaultView
  if (view === null) return true
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    const style = view.getComputedStyle(node)
    if (style.display === 'none') return false
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return false
    if (node === element.ownerDocument.body) break
  }
  return true
}

/** A ring stop: a shown, enabled answer control. */
function usable<T extends HTMLElement>(elements: T[]): T[] {
  return enabled(elements).filter(isShown)
}

/** Selectable option buttons of a question card, in display order. */
export function optionButtons(card: HTMLElement): HTMLElement[] {
  return enabled([...card.querySelectorAll<HTMLElement>('button[role="radio"], button[role="checkbox"]')])
}

/**
 * Whether the question on screen accepts several answers.
 *
 * The shipped card gives each option `role="checkbox"` for a multi-select question and
 * `role="radio"` otherwise, and wraps them in `role="group"` versus `role="radiogroup"`. Only
 * the option role is used here: `role="group"` is a general-purpose landmark that other DSH
 * surfaces (such as the question-reply receipt) also carry, so matching it could classify a
 * single-answer card as multi-select and silently disable its default selection.
 *
 * The distinction matters to the keyboard layer: in a multi-select question an option is a
 * toggle, so moving the ring across options must not toggle them — browsing would otherwise
 * check every option it passes.
 *
 * @param card - the `[data-question-key]` frame.
 * @returns whether several options may be selected at once.
 */
export function isMultiSelect(card: HTMLElement): boolean {
  return card.querySelector('button[role="checkbox"]') !== null
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
  return answeredOption(card) !== undefined || customAnswer(card) !== null
}

/** The option the card already shows as chosen, or undefined when none is. */
export function answeredOption(card: HTMLElement): HTMLElement | undefined {
  return optionButtons(card).find(button => button.getAttribute('aria-checked') === 'true')
}

/** The free-text answer field carrying a draft, or null when it is empty or absent. */
function customAnswer(card: HTMLElement): HTMLInputElement | HTMLTextAreaElement | null {
  const custom = card.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-question-scroll] input, [data-question-scroll] textarea')
  return custom !== null && custom.value.trim() !== '' ? custom : null
}

/** The approval card's decision buttons: the trailing action row is reject, then allow once. */
export function approvalButtons(card: HTMLElement): { allow?: HTMLElement; reject?: HTMLElement } {
  // Positions come from the real row, so a hidden button never shifts the mapping. A button
  // that is not on screen resolves to `undefined` rather than being clicked anyway: a synthetic
  // click would answer a permission prompt the user never saw.
  const buttons = enabled([...card.querySelectorAll<HTMLElement>('button')])
  const allow = buttons.at(-1)
  const reject = buttons.length >= 2 ? buttons.at(-2) : undefined
  return {
    allow: allow !== undefined && isShown(allow) ? allow : undefined,
    reject: reject !== undefined && isShown(reject) ? reject : undefined,
  }
}

/** The controls arrow keys traverse: the answer controls first, then the footer actions. */
export function focusRing(card: InteractionCard): HTMLElement[] {
  if (card.kind === 'approval') return usable([...card.element.querySelectorAll<HTMLElement>('button')])
  const ring: HTMLElement[] = []
  // Only controls that actually take an answer. The shipped body also carries chrome —
  // `MarkdownText` copy buttons in the question detail, and since 0.2.2 the copy-expand
  // toggles — none of which can hold the keyboard while hidden and none of which answers.
  const body = card.element.querySelector('[data-question-scroll]')
  if (body !== null) ring.push(...usable([...body.querySelectorAll<HTMLElement>(ANSWER_CONTROL)]))
  const footer = card.element.querySelector('footer')
  if (footer !== null) ring.push(...usable([...footer.querySelectorAll<HTMLElement>(CONTROL)]))
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
  // Position, never "the last enabled button": a disabled primary must stay disabled, and
  // filtering it out first would silently promote `Skip` to the confirming action.
  const buttons = [...footer.querySelectorAll<HTMLElement>('button')].filter(isShown)
  const primary = buttons.at(-1)
  if (primary === undefined) return undefined
  if ((primary as { readonly disabled?: boolean }).disabled === true) return undefined
  return primary
}

/** The header close control (minimize is the first icon button, close is the last). */
export function dismissButton(card: HTMLElement): HTMLElement | undefined {
  const header = card.querySelector('header')
  if (header === null) return undefined
  return enabled([...header.querySelectorAll<HTMLElement>('button')]).filter(isShown).at(-1)
}

/** Whether focus currently sits on a control that owns the key by itself. */
export function focusIsControl(active: Element | null): boolean {
  return active !== null && active.closest(CONTROL) !== null
}
