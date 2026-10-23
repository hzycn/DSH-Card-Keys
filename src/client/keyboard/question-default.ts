/** The question card's default selection.
 *
 * The shipped question card opens with nothing chosen unless the tool marked its first
 * option `(recommended)`, so everything else costs the user a click or a digit before
 * `Enter` has anything to submit and the primary action stays disabled.
 *
 * A single-question card gets a real selection: it goes through the shipped option button's
 * own `click`, exactly as if the user pressed `1`, so the draft, the `aria-checked` state,
 * and the enabled primary action all come from the official state machine. Nothing here
 * submits — `Enter` stays the only way to confirm.
 *
 * A multi-question card gets nothing: no selection and no ring. Selecting there makes the
 * shipped `choose` handler turn the page by itself, so a default applied to every page would
 * fill and skip the entire batch without the user seeing it; and a ring without a selection
 * under it reads as a default that was never given. This also matches DSH's own behaviour,
 * which leaves an option question with neither an option nor the free-text field focused. The
 * user's own digit or arrow is what starts the interaction, and the pager stays put.
 *
 * `watchCardDefaults` decides which card and when. A page turn re-renders inside the same
 * card element, so the watcher can treat the whole batch as one card. */

import { isMultiSelect, optionButtons, questionAnswered, questionCount } from './dom.js'
import type { InteractionCard } from './dom.js'

/** A dialog or menu owns the keyboard: a default click behind it would be invisible. */
const MODAL = '[role="dialog"][aria-modal="true"], [role="menu"]'
const EDITABLE = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]'

/**
 * Whether a real user is typing somewhere this card must not interrupt.
 *
 * The shipped question card autofocuses its own free-text field when it opens:
 * `autoFocus: canSubmit && countdown === undefined && !locked && !focusedQuestions.current.has(index)`.
 * Focus inside the card is therefore the card's own doing and says nothing about the user.
 * Only a field *outside* the card means someone is mid-sentence elsewhere and must not have
 * an option selected underneath them.
 *
 * This distinction is what made the default intermittent: a card without a countdown
 * autofocuses its field, so the old blanket "is an editable focused?" test refused the
 * default, while a card with a countdown skipped that autofocus and the default landed.
 */
function isTypingOutside(target: Element | null, card: HTMLElement): boolean {
  if (target === null) return false
  if (card.contains(target)) return false
  return target.closest(EDITABLE) !== null
}

/**
 * Select the first option of the question card.
 *
 * @param card - a live question card.
 * @param root - the document owning it.
 * @returns `false` only when the moment is wrong (a dialog in front, someone typing elsewhere)
 *   or the options are still locked, so the watcher retries instead of writing the card off.
 *   A card that already carries an answer returns `true`: it is settled, just not by us.
 */
export function selectQuestionDefault(card: InteractionCard, root: Document): boolean {
  if (card.kind !== 'question') return true
  // Leave the card alone while a menu or dialog is in front of it.
  if (root.querySelector(MODAL) !== null) return false
  if (isTypingOutside(root.activeElement, card.element)) return false
  const first = optionButtons(card.element)[0]
  // A locked card (busy, plan review) renders disabled options and must not be touched.
  if (first === undefined) return false

  // A multi-select question gets nothing: checking its first option would put an answer in the
  // box that the user never chose, and multi-select answers are additive — the user builds them
  // up with Space. It also takes no ring, so the card opens neutral and the arrows are the
  // starting point rather than a pre-made decision.
  if (isMultiSelect(card.element)) return true

  // A multi-question card gets nothing at all — no selection and no ring. It cannot take a
  // selection: selecting on such a card makes the shipped `choose` handler turn the page by
  // itself, so defaulting every page would fill and skip the whole batch. A ring is no use
  // either: with no selection under it, a ring only looks like a default the user never gave.
  // This matches DSH's own behaviour for option questions, which autofocuses neither an option
  // nor the free-text field. The page waits, visibly neutral, until the user acts.
  if (questionCount(card.element) > 1) return true

  // An already answered question keeps its answer; only a blank one takes the default.
  if (questionAnswered(card.element)) return true
  // Put the ring on the option as well as the answer: the card then opens showing exactly
  // what `Enter` would submit, the same way the approval card opens on its allow button.
  // DSH's own card leaves an option question unfocused, so this deliberately replaces that
  // with a predictable "one Enter confirms" start; a user who wants to type reaches the
  // field with the arrows, and it is already in the same focus ring.
  first.focus({ preventScroll: true })
  first.click()
  return true
}
