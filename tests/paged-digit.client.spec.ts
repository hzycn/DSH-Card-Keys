// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ShortcutFixedCommand, ShortcutFixedInput, Shortcuts } from '@deepseek-ai/dsh-client-shortcuts/client'
import { installCardKeys } from '../src/client/keyboard/install.js'
import { gesture } from './gesture.js'
import { mountQuestionCard } from './card-fixture.js'

/** Let the queued rollback microtasks run. */
async function flush(): Promise<void> {
  await new Promise<void>(resolve => { queueMicrotask(resolve) })
  await new Promise<void>(resolve => { queueMicrotask(resolve) })
}

function fakeShortcuts() {
  const commands: ShortcutFixedCommand[] = []
  const listeners = new Set<(input: ShortcutFixedInput) => void>()
  const shortcuts = {
    registerFixed(command: ShortcutFixedCommand): () => void {
      commands.push(command)
      return () => { const index = commands.indexOf(command); if (index >= 0) commands.splice(index, 1) }
    },
    observeFixedInput(listener: (input: ShortcutFixedInput) => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
  return {
    shortcuts: shortcuts as unknown as Shortcuts,
    emit(code: string) {
      const consume = vi.fn()
      const input: ShortcutFixedInput = {
        type: 'keydown',
        gesture: gesture({ code }),
        context: { region: 'page', modal: null, target: null },
        consume,
      }
      for (const listener of [...listeners]) listener(input)
      return consume
    },
  }
}

const disposers: (() => void)[] = []

function install() {
  const fake = fakeShortcuts()
  disposers.push(installCardKeys(fake.shortcuts, { label: () => 'Cards: select option with number keys' }))
  return fake
}

/**
 * A single-answer card paged like the shipped one: picking an option turns the page by itself.
 *
 * `replaces` mirrors the shipped re-render: a page turn swaps the option nodes for fresh ones,
 * which is what takes the keyboard with it. Without that, a ring placed on a stale node looks
 * fine in a test and disappears in the real app.
 */
function mountPagedCard(total: number, replaces = false) {
  const fixture = mountQuestionCard(document.body, 'q1', total)
  fixture.setPage(1, total)
  const turn = (index: number) => {
    fixture.setPage(index, total)
    if (!replaces) return
    // Swap in fresh option nodes, the way React does on a page change.
    for (const option of [...fixture.options]) {
      const fresh = option.cloneNode(true) as HTMLButtonElement
      option.replaceWith(fresh)
    }
    // Keep the fixture's list pointing at the nodes that are actually mounted.
    const live = [...fixture.card.querySelectorAll<HTMLButtonElement>('button[role="radio"], button[role="checkbox"]')]
    fixture.options.length = 0
    fixture.options.push(...live)
  }
  for (const option of [...fixture.options]) {
    option.addEventListener('click', () => {
      const index = fixture.page() ?? 1
      if (index < total) turn(index + 1)
    })
  }
  fixture.previous.addEventListener('click', () => {
    const index = fixture.page() ?? 1
    if (index > 1) turn(index - 1)
  })
  return fixture
}

/** Let the ring's frame-by-frame settle loop finish. */
async function frames(count = 8): Promise<void> {
  for (let i = 0; i < count; i++) {
    await new Promise<void>(resolve => { requestAnimationFrame(() => { resolve() }) })
  }
}

/** A keydown as the capture listener would receive it. */
function keydown(code: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { code, key: code === 'NumpadEnter' ? 'Enter' : code, bubbles: true, cancelable: true, ...init })
}

/** Dispatch a keydown at a target and report whether the guard took it. */
function press(target: EventTarget, code: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = keydown(code, init)
  target.dispatchEvent(event)
  return event
}

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.()
  document.body.replaceChildren()
  document.body.focus()
})

describe('a digit on a paged single-answer card only selects', () => {
  it('does not leave the page, unlike the shipped click', async () => {
    const fixture = mountPagedCard(3)
    const fake = install()
    // The card's opening default selects and rings its first option; let that settle before
    // exercising a key of the user's own, and forget its clicks.
    await frames()
    fixture.clicks.length = 0
    fixture.setPage(1, 3)
    fake.emit('Digit2')
    expect(fixture.clicks).toContain('option-2')
    await frames()
    expect(fixture.clicks).toContain('previous')
    expect(fixture.page()).toBe(1)
  })

  it('keeps the ring on the chosen option so the arrows keep working', async () => {
    // The ring must stay on the option, not jump to the footer: the next ArrowDown has to move
    // to the following option instead of restarting from the pager.
    const fixture = mountPagedCard(3)
    const fake = install()
    await frames()
    fixture.setPage(1, 3)
    fake.emit('Digit2')
    await frames()
    expect(document.activeElement).toBe(fixture.options[1])
  })

  it('keeps the ring on the chosen option when the rollback replaces the nodes', async () => {
    // The real card re-renders the page on a rollback, swapping the option nodes for new ones.
    // Focusing the old node looks right and then the ring vanishes with it — the bug this test
    // exists for.
    const fixture = mountPagedCard(3, true)
    const fake = install()
    fake.emit('Digit2')
    await frames()
    expect(fixture.page()).toBe(1)
    expect(document.activeElement).toBe(fixture.options[1])
    expect(fixture.options[1]?.isConnected).toBe(true)
  })

  it('walks down the option list after a digit', async () => {
    const fixture = mountPagedCard(3)
    const fake = install()
    fake.emit('Digit1')
    await frames()
    fake.emit('ArrowDown')
    expect(document.activeElement).toBe(fixture.options[1])
    fake.emit('ArrowDown')
    expect(document.activeElement).toBe(fixture.options[2])
    fake.emit('ArrowUp')
    expect(document.activeElement).toBe(fixture.options[1])
  })

  it('does not select twice when the digit already chose the option', async () => {
    const fixture = mountPagedCard(3)
    const fake = install()
    fixture.clicks.length = 0
    fake.emit('Digit2')
    await flush()
    const selects = fixture.clicks.filter(click => click === 'option-2')
    expect(selects).toHaveLength(1)
  })

  it('consumes the digit it acted on', () => {
    const fixture = mountPagedCard(2)
    const fake = install()
    const consume = fake.emit('Digit1')
    expect(consume).toHaveBeenCalledOnce()
    expect(fixture.clicks).toContain('option-1')
  })
})

describe('Enter confirms one page instead of submitting the batch', () => {
  it('clicks the footer primary action and stops the event', () => {
    const fixture = mountPagedCard(3)
    install()
    fixture.clicks.length = 0
    const event = press(fixture.options[0]!, 'Enter')
    expect(event.defaultPrevented).toBe(true)
    expect(fixture.clicks).toEqual(['primary'])
  })

  it('does not submit the batch through the option button', () => {
    // The shipped option handler would submit every question at once. Standing in for it here
    // proves the guard stops the event before it can reach that handler.
    const fixture = mountPagedCard(3)
    install()
    const submit = vi.fn()
    fixture.options[0]!.addEventListener('keydown', submit)
    press(fixture.options[0]!, 'Enter')
    expect(submit).not.toHaveBeenCalled()
  })

  it('leaves a single-question card to the shipped handler', () => {
    const fixture = mountQuestionCard()
    install()
    const event = press(fixture.options[0]!, 'Enter')
    expect(event.defaultPrevented).toBe(false)
  })

  it('leaves a multi-select card to its toggles', () => {
    const fixture = mountPagedCard(3)
    for (const option of fixture.options) option.setAttribute('role', 'checkbox')
    install()
    const event = press(fixture.options[0]!, 'Enter')
    expect(event.defaultPrevented).toBe(false)
  })

  it('ignores a modified or repeated Enter', () => {
    const fixture = mountPagedCard(3)
    install()
    for (const init of [{ shiftKey: true }, { ctrlKey: true }, { repeat: true }]) {
      const event = press(fixture.options[0]!, 'Enter', init)
      expect(event.defaultPrevented).toBe(false)
    }
  })

  it('ignores Enter from outside an option button', () => {
    const fixture = mountPagedCard(3)
    install()
    expect(press(fixture.primary, 'Enter').defaultPrevented).toBe(false)
    expect(press(fixture.custom, 'Enter').defaultPrevented).toBe(false)
  })

  it('does nothing while the page has no answer to confirm', () => {
    // The shipped card disables the primary action until the page is answered; a key that
    // confirmed nothing would just make the card complain.
    const fixture = mountPagedCard(3)
    install()
    fixture.primary.disabled = true
    const event = press(fixture.options[0]!, 'Enter')
    expect(event.defaultPrevented).toBe(false)
  })

  it('stops guarding once the feature is switched off', () => {
    const fixture = mountPagedCard(3)
    install()
    // Turn the feature off the way the settings switch does: run every disposer.
    while (disposers.length > 0) disposers.pop()?.()
    const event = press(fixture.options[0]!, 'Enter')
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('the rollback leaves the transcript where it was', () => {
  /**
   * A paged card inside a conversation scroller that behaves like the real one.
   *
   * The pager's own page change shrinks the content, and a browser clamps `scrollTop` to the new
   * maximum — it does not put it back when the content grows again. That lost offset is what
   * stops DSH from auto-following the transcript.
   *
   * `contentHeight` is mutable so a test can grow the transcript the way the app does while the
   * card is open.
   */
  function mountInScroller(total: number, scrollTop: number) {
    const scroller = document.createElement('div')
    scroller.setAttribute('data-conversation-scroll', '')
    const state = { height: 1000 }
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => state.height })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => 400 })
    document.body.append(scroller)

    const fixture = mountPagedCard(total, false)
    scroller.append(fixture.card)
    scroller.scrollTop = scrollTop

    // Every page change shrinks the content by 22px and clamps scrollTop like a browser.
    let shrink = false
    const clamp = () => {
      state.height = shrink ? 978 : 1000
      const max = state.height - 400
      if (scroller.scrollTop > max) scroller.scrollTop = max
    }
    for (const option of fixture.options) {
      option.addEventListener('click', () => { shrink = true; clamp() })
    }
    fixture.previous.addEventListener('click', () => { shrink = false; clamp() })
    return { fixture, scroller, state }
  }

  it('keeps the transcript at the bottom across repeated keys', async () => {
    // The reported bug: a few keys in a row each lose a little, and the transcript drifts far
    // enough from the bottom that DSH stops following it.
    const { fixture, scroller } = mountInScroller(3, 600)
    const fake = install()
    await frames()
    for (let i = 0; i < 5; i++) {
      fixture.setPage(1, 3)
      fake.emit('Digit2')
      await frames()
    }
    const gap = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
    expect(gap).toBeLessThanOrEqual(1)
  })

  it('follows new content that arrives while the keys are pressed', async () => {
    // A quick run of keys overlaps with the transcript growing. Pinning the offset to the value
    // read before the click would drag the chat back up and snap it down again — the lurch the
    // user sees. Following the bottom instead keeps it settled.
    const { fixture, scroller, state } = mountInScroller(3, 600)
    const fake = install()
    await frames()
    fake.emit('Digit2')
    state.height = 1200
    await frames()
    const gap = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
    expect(gap).toBeLessThanOrEqual(1)
  })

  it('leaves a transcript the user scrolled up alone', async () => {
    // Nothing was lost here: a short page cannot clamp an offset that was never at the maximum.
    // Touching it would throw the reader out of what they were reading.
    const { fixture, scroller } = mountInScroller(3, 100)
    const fake = install()
    await frames()
    const before = scroller.scrollTop
    fake.emit('Digit2')
    await frames()
    expect(scroller.scrollTop).toBe(before)
  })
})

describe('the other card shapes keep their old behaviour', () => {
  it('a single-question card still selects in place and keeps the ring on the option', () => {
    const fixture = mountQuestionCard()
    const fake = install()
    fixture.clicks.length = 0
    fake.emit('Digit2')
    expect(fixture.clicks).toEqual(['option-2'])
    expect(document.activeElement).toBe(fixture.options[1])
  })

  it('a multi-select question moves the ring without checking anything', () => {
    const fixture = mountQuestionCard(document.body, 'm1', 1, true)
    for (const option of fixture.options) {
      option.addEventListener('click', () => {
        option.setAttribute('aria-checked', String(option.getAttribute('aria-checked') !== 'true'))
      })
    }
    const fake = install()
    fixture.clicks.length = 0
    fake.emit('Digit2')
    // A digit navigates in a multi-select card; Space is what checks.
    expect(fixture.clicks).toEqual([])
    expect(document.activeElement).toBe(fixture.options[1])
    expect(fixture.options[1]?.getAttribute('aria-checked')).toBe('false')
  })

  it('a multi-select question never walks the pager', async () => {
    const fixture = mountPagedCard(3)
    for (const option of fixture.options) option.setAttribute('role', 'checkbox')
    const fake = install()
    fixture.clicks.length = 0
    fake.emit('Digit2')
    await frames()
    expect(fixture.clicks).toEqual([])
    expect(fixture.clicks).not.toContain('previous')
    expect(fixture.page()).toBe(1)
  })
})
