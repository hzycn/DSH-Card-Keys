// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { focusApprovalAllow } from '../src/client/keyboard/focus.js'
import { installCardKeys } from '../src/client/keyboard/install.js'
import { watchCardDefaults } from '../src/client/keyboard/watch.js'
import type { ShortcutFixedCommand, ShortcutFixedInput, Shortcuts } from '@deepseek-ai/dsh-client-shortcuts/client'
import { mountApprovalCard, mountQuestionCard } from './card-fixture.js'
import { gesture } from './gesture.js'

/** Let jsdom deliver the observer's microtask batch. */
async function flush(): Promise<void> {
  await new Promise<void>(resolve => { queueMicrotask(resolve) })
}

/** Let a pending frame callback run, then the observer batch it schedules. */
async function frame(): Promise<void> {
  await new Promise<void>(resolve => { requestAnimationFrame(() => { resolve() }) })
  await flush()
}

/** A stand-in for the Client shortcuts service: records the row and replays input. */
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

/** Watch cards and apply the approval focus, recording every card the watcher reports. */
function watching() {
  const handled: string[] = []
  const dispose = watchCardDefaults({
    // The callback's result is load-bearing: `false` keeps the card pending for a retry.
    onCard: card => {
      handled.push(card.kind)
      return card.kind === 'approval' ? focusApprovalAllow(card, document) : true
    },
  })
  disposers.push(dispose)
  return { handled }
}

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.()
  document.body.replaceChildren()
  document.body.focus()
})

describe('approval default focus', () => {
  it('puts the keyboard on the allow button as soon as the card appears', async () => {
    const watch = watching()
    const fixture = mountApprovalCard()
    await flush()
    expect(document.activeElement).toBe(fixture.allow)
    expect(watch.handled).toEqual(['approval'])
  })

  it('adopts a card that was already on screen when the watcher started', () => {
    const fixture = mountApprovalCard()
    watching()
    expect(document.activeElement).toBe(fixture.allow)
  })

  it('still focuses a card that mounts hidden and becomes visible a frame later', async () => {
    // This is the regression that made the first build look inert: the takeover exists in
    // the DOM before it is laid out, so a check tied only to insertion missed it forever.
    const fixture = mountApprovalCard()
    fixture.card.style.display = 'none'
    const watch = watching()
    await flush()
    expect(document.activeElement).not.toBe(fixture.allow)
    expect(watch.handled).toEqual([])
    fixture.card.style.display = ''
    await frame()
    expect(document.activeElement).toBe(fixture.allow)
    expect(watch.handled).toEqual(['approval'])
  })

  it('never pulls focus back after the user moves it', async () => {
    watching()
    const fixture = mountApprovalCard()
    await flush()
    fixture.reject.focus()
    // An ordinary re-render of the same card.
    fixture.card.append(document.createElement('span'))
    await frame()
    expect(document.activeElement).toBe(fixture.reject)
  })

  it('gives a queued second approval its own initial focus', async () => {
    watching()
    const first = mountApprovalCard(document.body, 'a1')
    await flush()
    expect(document.activeElement).toBe(first.allow)
    const second = mountApprovalCard(document.body, 'a2')
    await frame()
    expect(document.activeElement).toBe(second.allow)
  })

  it('lands on the allow button once it stops being disabled', async () => {
    // An approval often mounts with its buttons briefly disabled while the Host settles the
    // request. The default must wait for the real moment instead of being lost.
    const fixture = mountApprovalCard()
    fixture.allow.disabled = true
    fixture.reject.disabled = true
    watching()
    await frame()
    expect(document.activeElement).not.toBe(fixture.allow)
    fixture.allow.disabled = false
    fixture.reject.disabled = false
    await frame()
    expect(document.activeElement).toBe(fixture.allow)
  })

  it('ignores the question card', async () => {
    const watch = watching()
    mountQuestionCard()
    await flush()
    expect(document.activeElement).toBe(document.body)
    expect(watch.handled).toEqual(['question'])
  })

  it('stops watching once disposed', async () => {
    const dispose = watchCardDefaults({ onCard: card => { focusApprovalAllow(card, document) } })
    dispose()
    const fixture = mountApprovalCard()
    await frame()
    expect(document.activeElement).not.toBe(fixture.allow)
  })
})

describe('one Enter grants the focused permission', () => {
  it('reaches the allow button the watcher focused, without the plugin clicking it', async () => {
    const fake = fakeShortcuts()
    disposers.push(installCardKeys(fake.shortcuts, { label: () => 'Cards: select option with number keys' }))
    const fixture = mountApprovalCard()
    await frame()
    expect(document.activeElement).toBe(fixture.allow)

    // The plugin declines Enter on an approval, so it neither consumes it nor clicks.
    const consume = fake.emit('Enter')
    expect(consume).not.toHaveBeenCalled()
    expect(fixture.clicks).toEqual([])

    // The browser's own activation of the focused shipped button is what answers.
    fixture.allow.click()
    expect(fixture.clicks).toEqual(['allow'])
  })
})
