/** Enter confirmation on a paged single-answer question card.
 *
 * The shipped option button carries:
 *
 *   onKeyDown: event => { if (event.key !== 'Enter') return; event.preventDefault(); submitDrafts(drafts) }
 *
 * `submitDrafts` submits the **whole batch**: on page 1 of 3 it finds page 2 unanswered, jumps
 * there, and shows "Please complete this question first." The user pressed Enter to confirm
 * the page they were reading, not to be told off about a page they have not seen.
 *
 * The plugin cannot simply let that key through and react afterwards, and it cannot prevent it
 * from the fixed-action channel either: React attaches its listener to the app's root container
 * during the bubble phase, and the plugin's fixed channel runs later than that. Whichever
 * handler runs first wins, and React's would already have submitted.
 *
 * A listener on `window` in the **capture** phase runs before the event ever reaches the root
 * container, so it is the only place from which that handler can be stopped. This module owns
 * exactly that one job, for exactly one card shape:
 *
 * - paged single-answer question card (a footer `n / total` pager, no checkbox options)
 * - `Enter`, no modifiers, focus on one of that card's option buttons
 *
 * Everything else falls through untouched — single-question cards keep their shipped
 * "Enter submits" behaviour, multi-select cards keep their toggles, and approval cards never
 * reach here at all.
 *
 * This is deliberately narrower than the keyboard layer around it: it exists to correct one
 * shipped behaviour that cannot be reached any other way, and it never performs an action the
 * card does not already offer. It clicks the card's own footer primary button (Next / Submit),
 * which is the same control a user would click to advance. */

import { activeCard, isMultiSelect, isOption, primaryButton, questionCount } from './dom.js'

/** Keys this guard owns. Anything else is left to the page. */
const CONFIRM_CODES = new Set(['Enter', 'NumpadEnter'])

/**
 * Whether the event targets an option button inside a paged single-answer question card.
 *
 * @param target - the event target, already resolved from the composed path.
 * @returns the card when its primary action should confirm this page on Enter.
 */
function pagedCardOf(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null
  if (!isOption(target)) return null
  const card = activeCard()
  if (card === null || card.kind !== 'question') return null
  if (!card.element.contains(target)) return null
  if (isMultiSelect(card.element)) return null
  return questionCount(card.element) > 1 ? card.element : null
}

/**
 * Stop Enter from submitting a whole batch when it was meant to confirm one page.
 *
 * @param event - the capture-phase keydown.
 * @returns whether the guard took the key.
 */
export function takePagedConfirm(event: KeyboardEvent): boolean {
  if (!CONFIRM_CODES.has(event.code) && !CONFIRM_CODES.has(event.key)) return false
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return false
  if (event.repeat || event.isComposing) return false
  const element = pagedCardOf(event.target)
  if (element === null) return false
  // The card's own confirming action, located by position in the footer. It is disabled while
  // the page is unanswered, in which case there is nothing to confirm and the key is left to
  // the page — the shipped card would only report "unanswered" for a key that did nothing.
  const primary = primaryButton({ kind: 'question', element })
  if (primary === undefined) return false
  event.preventDefault()
  // `stopPropagation` in the capture phase keeps the event from reaching the React root, whose
  // option handler would otherwise submit the batch. `stopImmediatePropagation` would also
  // silence DSH's own capture listeners; only this one handler has to be skipped.
  event.stopPropagation()
  primary.click()
  return true
}

/**
 * Install the paged-confirm guard.
 *
 * @param root - document to listen on, defaulting to the live one.
 * @returns disposer removing the listener.
 */
export function installConfirmGuard(root: Document = document): () => void {
  const listener = (event: Event): void => {
    if (event instanceof KeyboardEvent) takePagedConfirm(event)
  }
  root.defaultView?.addEventListener('keydown', listener, true)
  return () => { root.defaultView?.removeEventListener('keydown', listener, true) }
}
