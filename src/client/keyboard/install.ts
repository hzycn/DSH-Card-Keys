/** Wiring: official arbitrated input → pure decision → ordinary DOM action.
 *
 * Nothing is registered globally: the number keys ride the official fixed-action
 * channel (`registerFixed` + `observeFixedInput`), which already declines while a
 * text field, a modal, or an IME composition owns the keyboard. The handler then
 * performs a plain click or focus move on the shipped card markup. */

import type { Shortcuts } from '@deepseek-ai/dsh-client-shortcuts/client'
import { approvalButtons, activeCard, dismissButton, focusIsControl, focusRing, isMultiSelect, isOption, optionButtons, primaryButton } from './dom.js'
import type { InteractionCard } from './dom.js'
import { scheduleComposerFocus } from './composer-focus.js'
import { createSelectOptionCommand } from './fixed.js'
import type { FixedKeyInput } from './fixed.js'
import { focusApprovalAllow } from './focus.js'
import { planKey } from './plan.js'
import type { CardAction, KeyFacts } from './plan.js'
import { selectWithoutPaging } from './paging.js'
import { selectQuestionDefault } from './question-default.js'
import { watchCardDefaults } from './watch.js'

export interface CardKeysOptions {
  /** Localized label for the official keyboard settings row. */
  readonly label: () => string
}

/**
 * Install the card keyboard layer on the official fixed-action channel.
 *
 * Call it while the feature switch is on and dispose it when it turns off, so the
 * official settings row follows the switch exactly.
 *
 * @param shortcuts - the Client shortcuts service.
 * @param options - localized row label.
 * @returns disposer releasing the row and the observer.
 */
export function installCardKeys(shortcuts: Shortcuts, options: CardKeysOptions): () => void {
  // The row is documentation and key reservation; a stale duplicate id (a reload that
  // has not disposed the previous instance yet) must not take the keys down with it.
  let offCommand: (() => void) | undefined
  try {
    offCommand = shortcuts.registerFixed(createSelectOptionCommand(options.label))
  } catch {
    offCommand = undefined
  }
  const offInput = shortcuts.observeFixedInput(input => {
    if (input.type !== 'keydown') return
    if (handleInput(input)) input.consume()
  })
  // Each card opens in a usable state: the approval card on its allow button, the question
  // card with its first option already selected. The watcher decides which card and when —
  // exactly once per card — because a takeover can mount hidden and become visible a frame
  // later, and because a default may have to wait for the right moment. The callback's result
  // must be propagated: `false` means "not yet, retry", and swallowing it here made the
  // watcher write a card off after the first declined attempt.
  /** Cancels a scheduled composer-focus retry; replaced on every card close. */
  let composerRetry: (() => void) | undefined
  const offDefaults = watchCardDefaults({
    onCard: card => (card.kind === 'approval'
      ? focusApprovalAllow(card, document)
      : selectQuestionDefault(card, document)),
    // Answering the last card removes the takeover and focus falls to the page body. Hand the
    // keyboard back so the user can keep typing without reaching for the mouse. The helper is
    // conservative: it only acts when focus is truly loose and the composer is editable.
    onAllCardsClosed: () => { composerRetry?.(); composerRetry = scheduleComposerFocus(document) },
  })
  return () => { composerRetry?.(); offDefaults(); offInput(); offCommand?.() }
}

/**
 * Judge one arbitrated input and perform its action.
 *
 * @param input - arbitrated fixed input delivered by DSH.
 * @returns whether the card took the key (only then is it consumed).
 */
export function handleInput(input: FixedKeyInput): boolean {
  const card = activeCard()
  if (card === null) return false
  const action = planKey(factsFor(input, card))
  if (action.type === 'none') return false
  return perform(action, card)
}

/** Project the arbitrated gesture and live card into the pure decision's facts. */
export function factsFor(input: FixedKeyInput, card: InteractionCard): KeyFacts {
  const active = document.activeElement
  const focusInsideCard = active !== null && card.element.contains(active)
  return {
    code: input.gesture.code,
    region: input.context.region,
    modal: input.context.modal,
    composing: input.gesture.composing,
    defaultPrevented: input.gesture.defaultPrevented,
    repeat: input.gesture.repeat,
    control: input.gesture.control,
    alt: input.gesture.alt,
    shift: input.gesture.shift,
    meta: input.gesture.meta,
    cardKind: card.kind,
    optionCount: card.kind === 'question' ? optionButtons(card.element).length : 0,
    multiSelect: card.kind === 'question' && isMultiSelect(card.element),
    focusInsideCard,
    focusIsControl: focusInsideCard && focusIsControl(active),
  }
}

/** Perform one decided action against the shipped card markup. */
export function perform(action: CardAction, card: InteractionCard): boolean {
  switch (action.type) {
    case 'selectOption': {
      const button = optionButtons(card.element)[action.index]
      if (button === undefined) return false
      button.focus()
      button.click()
      return true
    }
    case 'approval': {
      const buttons = approvalButtons(card.element)
      const target = action.outcome === 'allow' ? buttons.allow : buttons.reject
      if (target === undefined) return false
      target.click()
      return true
    }
    case 'toggleOption': {
      // Toggle whatever option the ring is on. Nothing focused inside the card means there is
      // no target, so the key keeps its normal job.
      const active = document.activeElement
      if (!(active instanceof HTMLElement) || !isOption(active)) return false
      active.click()
      return true
    }
    case 'moveFocus': {
      const ring = focusRing(card)
      if (ring.length === 0) return false
      const current = ring.indexOf(document.activeElement as HTMLElement)
      const next = current < 0
        ? (action.delta > 0 ? 0 : ring.length - 1)
        : (current + action.delta + ring.length) % ring.length
      const target = ring[next]
      if (target === undefined) return false
      target.focus()
      // On a single-answer question, landing on an option also selects it: the ring and the
      // answer stay together, so an arrow key is a complete way to choose and `Enter` then
      // submits what the user sees. Only options are selected; the footer pager and the answer
      // field keep focus only.
      //
      // A multi-select question is different: its options are toggles, so selecting while
      // moving would check every option the ring passes and make browsing impossible. There the
      // arrows only move the ring; the user toggles with Space or a digit.
      //
      // Arrows never turn the page, though. On a single-select multi-question card the shipped
      // `choose` advances by itself, which would make `↓` mean "next question" instead of
      // "next option" — so the selection is made and the page is put back.
      if (card.kind === 'question' && isOption(target) && !isMultiSelect(card.element)) {
        selectWithoutPaging(card.element, target)
      }
      return true
    }
    case 'activate': {
      const button = primaryButton(card)
      if (button === undefined) return false
      button.click()
      return true
    }
    case 'dismiss': {
      const button = dismissButton(card.element)
      if (button === undefined) return false
      button.click()
      return true
    }
    default:
      return false
  }
}
