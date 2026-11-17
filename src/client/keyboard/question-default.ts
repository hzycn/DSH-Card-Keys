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
 * A multi-question card gets the same treatment, but the click has to travel through the
 * paging guard: on that shape a plain click makes the shipped `choose` handler turn the page
 * by itself, so every page would be filled and skipped without the user seeing it. The
 * option is clicked and the page walked straight back, leaving the page showing exactly what
 * `Enter` would submit. A multi-select card is the exception in one respect only: it takes
 * the ring and never a check, because its answers are additive and a pre-checked box is a
 * decision the user did not make.
 *
 * `watchCardDefaults` decides which card and when. A page turn re-renders inside the same
 * card element, so the watcher can treat the whole batch as one card. */

import { answeredOption, customAnswer, isMultiSelect, optionButtons, questionCount } from './dom.js'
import type { InteractionCard } from './dom.js'
import { ROLLBACK_FLAG, ringIsLoose, selectWithoutPaging, settleRingOn } from './paging.js'

/** A dialog or menu owns the keyboard: a default click behind it would be invisible. */
const MODAL = '[role="dialog"][aria-modal="true"], [role="menu"]'
const EDITABLE = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]'

/**
 * Put the ring on the first option, but only when the keyboard has nowhere else to be.
 *
 * These cards take a ring and never a selection, so the ring is pure navigation aid. It must
 * still yield to two things the user has already done:
 *
 * - a real focus target of their own — the answer field, the footer. `ringIsLoose` is the one
 *   definition of that, shared with the paging guard, so the two cannot drift apart.
 * - a page that is still mid-rollback. Selecting with a digit or an arrow on a paged card
 *   makes the shipped `choose` advance, and the paging guard clicks the previous button a
 *   microtask later and then restores the ring to the option the user picked. A default that
 *   fired in between would put the ring back on the first option and wipe out their choice,
 *   so the ring is left alone while a rollback is in flight.
 *
 * @param card - the live question card.
 * @param first - its first usable option.
 * @param root - the document owning it.
 */
function ringOnFirst(card: HTMLElement, first: HTMLElement, root: Document): void {
  if (rollbackPending(card)) return
  if (!ringIsLoose(card, root)) return
  first.focus({ preventScroll: true })
}

/**
 * Whether the paging guard is currently walking a page back.
 *
 * The guard announces itself on the card element rather than in module state, so the check
 * keeps working across the two modules without them importing each other, and it leaves no
 * state behind if a rollback never completes.
 *
 * @param card - the live question card.
 * @returns whether a rollback is in flight.
 */
function rollbackPending(card: HTMLElement): boolean {
  return card.hasAttribute(ROLLBACK_FLAG)
}

/**
 * Whether the card already carries a typed answer of the user's.
 *
 * @param card - the live question card.
 * @returns whether the free-text field holds a draft.
 */
function hasDraft(card: HTMLElement): boolean {
  return customAnswer(card) !== null
}

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

  // A typed draft is the user's own answer, in progress right now. Never put a ring on an
  // option beside it: the card's free-text field is where their attention is, and moving focus
  // out of it would interrupt what they are writing. Checked before every other branch because
  // it applies to all three card shapes.
  if (hasDraft(card.element)) return true

  const paged = questionCount(card.element) > 1

  // A multi-select question takes the ring but never an answer. Checking its first option
  // would put a choice in the box that the user never made, and multi-select answers are
  // additive — the user builds them up with Space, one deliberate toggle at a time. So the
  // card opens with the ring on the first option and nothing checked: the arrows and Space
  // then start from a visible place instead of from nowhere.
  //
  // A preselected option is the one exception. A multi-select answer is a set of independent
  // toggles, so a ring on a chosen option turns the next `Space` into an uncheck of a choice
  // that is already correct. Those cards take no ring at all.
  if (isMultiSelect(card.element)) {
    if (answeredOption(card.element) === undefined) ringOnFirst(card.element, first, root)
    return true
  }

  // A multi-question card answers its first option as well as ringing it — the same "the card
  // opens showing exactly what Enter would submit" the single-question card gets. The click has
  // to go through the paging guard: on this card shape a plain click makes the shipped `choose`
  // handler turn the page by itself, so it is clicked and the page is walked straight back, with
  // the ring restored to the option.
  //
  // Each page turn brings the watcher back here, since a page re-render is a new `pageKey`, so
  // every page opens answered without any page being skipped.
  if (paged) {
    // Two things make this the wrong moment, and both are the user's rather than the card's:
    // a rollback in flight (the guard is about to restore the option they picked, and a default
    // here would replace it with the first one), or a focus that is not the plugin's to take.
    // Both settle the card for the watcher — declining to act is the answer, not "retry".
    if (rollbackPending(card.element) || !ringIsLoose(card.element, root)) return true
    const position = optionButtons(card.element).indexOf(first)
    selectWithoutPaging(card.element, first)
    // The guard restores the ring on its own schedule; this covers the no-rollback case, where
    // the click re-rendered the card without moving the page.
    settleRingOn(card.element, position)
    return true
  }

  // An already answered question keeps its answer; only a blank one takes the default.
  //
  // Since DSH 0.2.2 a choice the tool marked `(Recommended)` arrives pre-selected — for a
  // single-select question the first one, for a multi-select every marked one — so "already
  // answered" is now the common case rather than an edge case. The answer must still not be
  // overwritten, but the ring has to start somewhere: leaving focus on the page body means the
  // card opens looking answered yet the keyboard is nowhere, and the user's first arrow press
  // has no visible origin. Put the ring on the option that is already chosen, which changes no
  // answer at all.
  //
  // Multi-select cards never reach this line: they returned above, before any selection was
  // made. The only answers possible here are single-select ones.
  const chosen = answeredOption(card.element)
  if (chosen !== undefined) {
    chosen.focus({ preventScroll: true })
    return true
  }
  // Put the ring on the option as well as the answer: the card then opens showing exactly
  // what `Enter` would submit, the same way the approval card opens on its allow button.
  // DSH's own card leaves an option question unfocused, so this deliberately replaces that
  // with a predictable "one Enter confirms" start; a user who wants to type reaches the
  // field with the arrows, and it is already in the same focus ring.
  //
  // The click re-renders the card, and that render can replace the option nodes — taking the
  // focus set a line above with it, which leaves the card looking answered but with no ring
  // anywhere. So the ring is re-asserted across the frames the render may span.
  first.click()
  settleRingOn(card.element, 0, true)
  return true
}
