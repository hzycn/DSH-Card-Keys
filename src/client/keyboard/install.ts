/** Wiring: official arbitrated input → pure decision → ordinary DOM action.
 *
 * Nothing is registered globally: the number keys ride the official fixed-action
 * channel (`registerFixed` + `observeFixedInput`), which already declines while a
 * text field, a modal, or an IME composition owns the keyboard. The handler then
 * performs a plain click or focus move on the shipped card markup. */

import type { Shortcuts } from '@deepseek-ai/dsh-client-shortcuts/client'
import { approvalButtons, activeCard, dismissButton, focusIsControl, focusRing, optionButtons, primaryButton } from './dom.js'
import type { InteractionCard } from './dom.js'
import { createSelectOptionCommand } from './fixed.js'
import type { FixedKeyInput } from './fixed.js'
import { planKey } from './plan.js'
import type { CardAction, KeyFacts } from './plan.js'

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
  return () => { offInput(); offCommand?.() }
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
    case 'moveFocus': {
      const ring = focusRing(card)
      if (ring.length === 0) return false
      const current = ring.indexOf(document.activeElement as HTMLElement)
      const next = current < 0
        ? (action.delta > 0 ? 0 : ring.length - 1)
        : (current + action.delta + ring.length) % ring.length
      ring[next]?.focus()
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
