/** The approval card's initial keyboard focus.
 *
 * The shipped approval card renders its action row as `Reject` then `Allow once`, and it
 * never moves focus itself, so a fresh card leaves the keyboard on the page. Granting a
 * permission then costs several presses: the first arrow key only reaches `Reject`, and
 * `Enter` means nothing until a decision button actually has focus.
 *
 * This module focuses the `Allow once` button of the card it is handed. It confirms
 * nothing: `planKey` still refuses `Enter` on an approval, so the package keeps its rule
 * that an ambiguous key can never become a permission grant. What the focus changes is only
 * the starting point — `Enter` then reaches the already-focused shipped button and the
 * browser performs its ordinary activation, the same click a pointer gives. The ring comes
 * from DSH's own `focus.css`: visible under keyboard modality, transparent under pointer
 * modality, so the ring and the real destination always agree.
 *
 * `watchCardDefaults` decides which card and when, exactly once per card. */

import { approvalButtons } from './dom.js'
import type { InteractionCard } from './dom.js'

/** Controls where a key press is input, not a card decision: never steal these. */
const EDITABLE = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]'
const TERMINAL = '.xterm'

/**
 * Whether a real user is typing somewhere this card must not interrupt.
 *
 * Focus inside the card itself is the card's own doing and says nothing about the user: the
 * question card autofocuses its answer field, and a card containing a field must still open
 * with its decision focused. Only a field or terminal *outside* the card counts. Grabbing
 * focus from someone genuinely mid-sentence elsewhere would turn their ordinary digits into
 * approve/reject — `1` and `2` answer an approval — so that case is left to the arrows.
 */
function isTypingOutside(target: Element | null, card: HTMLElement): boolean {
  if (target === null) return false
  if (card.contains(target)) return false
  return target.closest(EDITABLE) !== null || target.closest(TERMINAL) !== null
}

/**
 * Put the keyboard on the card's `Allow once` button.
 *
 * @param card - a live approval card.
 * @param root - the document owning it.
 * @returns `false` only when the moment is wrong (someone typing elsewhere) or the buttons
 *   are still disabled, so the watcher retries instead of writing the card off.
 */
export function focusApprovalAllow(card: InteractionCard, root: Document): boolean {
  if (card.kind !== 'approval') return true
  if (isTypingOutside(root.activeElement, card.element)) return false
  const allow = approvalButtons(card.element).allow
  if (allow === undefined) return false
  // `preventScroll` keeps a takeover that opened near the viewport edge from jumping: the
  // card is already in place, so focusing it should not move the page.
  allow.focus({ preventScroll: true })
  return root.activeElement === allow
}
