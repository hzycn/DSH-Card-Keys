// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { focusComposer, scheduleComposerFocus } from '../src/client/keyboard/composer-focus.js'
import { watchCardDefaults } from '../src/client/keyboard/watch.js'
import { mountApprovalCard, mountQuestionCard } from './card-fixture.js'

/** Let jsdom deliver the observer's microtask batch. */
async function flush(): Promise<void> {
  await new Promise<void>(resolve => { queueMicrotask(resolve) })
}

/** Let any scheduled frame run, then the observer batch it triggers. */
async function frame(): Promise<void> {
  await flush()
  await new Promise<void>(resolve => { requestAnimationFrame(() => { resolve() }) })
  await flush()
}

/** Mount a stand-in for the shipped composer: the markup DSH uses for its editable input. */
function mountComposer(): HTMLElement {
  const input = document.createElement('div')
  input.setAttribute('data-composer-input', '')
  input.setAttribute('role', 'textbox')
  input.setAttribute('contenteditable', 'true')
  document.body.append(input)
  return input
}

const disposers: (() => void)[] = []

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.()
  document.body.replaceChildren()
  document.body.focus()
})

describe('composer focus', () => {
  it('focuses the shipped composer input when focus is loose', () => {
    const input = mountComposer()
    document.body.focus()
    expect(focusComposer(document)).toBe(true)
    expect(document.activeElement).toBe(input)
  })

  it('never steals focus from wherever the user actually is', () => {
    mountComposer()
    const elsewhere = document.createElement('input')
    document.body.append(elsewhere)
    elsewhere.focus()
    expect(focusComposer(document)).toBe(false)
    expect(document.activeElement).toBe(elsewhere)
  })

  it('leaves a disabled composer alone', () => {
    const input = mountComposer()
    input.removeAttribute('contenteditable')
    document.body.focus()
    expect(focusComposer(document)).toBe(false)
    expect(document.activeElement).not.toBe(input)
  })

  it('reports failure when there is no composer on the page', () => {
    document.body.focus()
    expect(focusComposer(document)).toBe(false)
  })

  it('retries on the next frame when the composer is not ready yet', async () => {
    document.body.focus()
    const cancel = scheduleComposerFocus(document)
    disposers.push(cancel)
    // The composer appears only after the takeover has really gone.
    const input = mountComposer()
    await frame()
    expect(document.activeElement).toBe(input)
  })
})

describe('focus returns after a card is answered', () => {
  it('hands the keyboard back once the last question card closes', async () => {
    const input = mountComposer()
    const fixture = mountQuestionCard()
    watchCardDefaults({
      onCard: () => true,
      onAllCardsClosed: () => { focusComposer(document) },
    })
    await flush()
    fixture.card.remove()
    await frame()
    expect(document.activeElement).toBe(input)
  })

  it('hands the keyboard back once the last approval card closes', async () => {
    const input = mountComposer()
    const fixture = mountApprovalCard()
    watchCardDefaults({
      onCard: () => true,
      onAllCardsClosed: () => { focusComposer(document) },
    })
    await flush()
    fixture.card.remove()
    await frame()
    expect(document.activeElement).toBe(input)
  })

  it('does not grab the composer when the next card is already queued', async () => {
    mountComposer()
    const first = mountApprovalCard(document.body, 'a1')
    const second = mountApprovalCard(document.body, 'a2')
    let closes = 0
    watchCardDefaults({
      onCard: () => true,
      onAllCardsClosed: () => { closes += 1 },
    })
    await flush()
    first.card.remove()
    await frame()
    // A second approval is still waiting, so this is not the end of the interaction.
    expect(closes).toBe(0)
    second.card.remove()
    await frame()
    expect(closes).toBe(1)
  })

  it('reports the close exactly once', async () => {
    let closes = 0
    const fixture = mountQuestionCard()
    watchCardDefaults({
      onCard: () => true,
      onAllCardsClosed: () => { closes += 1 },
    })
    await flush()
    fixture.card.remove()
    await frame()
    // Unrelated re-renders after the card is gone must not keep firing.
    document.body.append(document.createElement('span'))
    await frame()
    expect(closes).toBe(1)
  })
})
