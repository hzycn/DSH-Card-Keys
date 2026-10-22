// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { activeCard, approvalButtons, dismissButton, focusRing, optionButtons, primaryButton } from '../src/client/keyboard/dom.js'
import { mountApprovalCard, mountQuestionCard } from './card-fixture.js'

afterEach(() => { document.body.replaceChildren() })

describe('active card discovery', () => {
  it('finds the question card that is on screen', () => {
    const fixture = mountQuestionCard()
    const card = activeCard(document)
    expect(card?.kind).toBe('question')
    expect(card?.element).toBe(fixture.card)
  })

  it('prefers the approval card and the most recently mounted one', () => {
    mountQuestionCard()
    const first = mountApprovalCard(document.body, 'a1')
    const second = mountApprovalCard(document.body, 'a2')
    expect(activeCard(document)?.element).toBe(second.card)
    expect(activeCard(document)?.kind).toBe('approval')
    second.card.remove()
    expect(activeCard(document)?.element).toBe(first.card)
  })

  it('reports no card once every frame is gone or hidden', () => {
    const fixture = mountQuestionCard()
    fixture.card.hidden = true
    expect(activeCard(document)).toBeNull()
    fixture.card.hidden = false
    fixture.card.remove()
    expect(activeCard(document)).toBeNull()
  })
})

describe('question card controls', () => {
  it('lists the option buttons in display order', () => {
    const fixture = mountQuestionCard()
    expect(optionButtons(fixture.card)).toEqual(fixture.options)
  })

  it('walks the answer body and then the footer with the arrow ring', () => {
    const fixture = mountQuestionCard()
    expect(focusRing({ kind: 'question', element: fixture.card })).toEqual([
      ...fixture.options,
      fixture.custom,
      fixture.previous,
      fixture.next,
      fixture.skip,
      fixture.primary,
    ])
  })

  it('confirms with the footer primary action and closes with the header close button', () => {
    const fixture = mountQuestionCard()
    expect(primaryButton({ kind: 'question', element: fixture.card })).toBe(fixture.primary)
    expect(dismissButton(fixture.card)).toBe(fixture.close)
  })
})

describe('approval card controls', () => {
  it('reads the trailing action row as reject then allow once', () => {
    const fixture = mountApprovalCard()
    const buttons = approvalButtons(fixture.card)
    expect(buttons.reject).toBe(fixture.reject)
    expect(buttons.allow).toBe(fixture.allow)
    expect(primaryButton({ kind: 'approval', element: fixture.card })).toBe(fixture.allow)
  })

  it('focuses both decision buttons', () => {
    const fixture = mountApprovalCard()
    expect(focusRing({ kind: 'approval', element: fixture.card })).toEqual([fixture.reject, fixture.allow])
  })
})
