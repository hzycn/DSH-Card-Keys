// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ShortcutFixedCommand, ShortcutFixedInput, Shortcuts } from '@deepseek-ai/dsh-client-shortcuts/client'
import { focusRing, isShown } from '../src/client/keyboard/dom.js'
import { installCardKeys, perform } from '../src/client/keyboard/install.js'
import { selectQuestionDefault } from '../src/client/keyboard/question-default.js'
import { mountApprovalCard, mountQuestionCard } from './card-fixture.js'
import { gesture } from './gesture.js'

/**
 * Regression cover for the DSH 0.2.2 card chrome.
 *
 * 0.2.2 renders two copy-expand buttons inside `[data-question-scroll]`: one on the question
 * title (always present, above the options) and one after any option with a description.
 * Both are `visibility: hidden` until their text overflows, and `focus()` on a hidden button
 * is a silent no-op in a real browser. A ring built from "every control in the body" adopted
 * them as stops; the arrow key then focused nothing, reported success, and was consumed —
 * which read as "the arrow keys stopped working" on every option card.
 *
 * jsdom does not enforce focusability, so the tests below pin the two halves separately:
 * the ring must never *offer* a hidden stop (that is the fix), and a stop that refuses focus
 * must not swallow the key (that is the guard for the next DSH change).
 */

interface FakeOptions {
  readonly code: string
  readonly repeat?: boolean
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
    emit(options: FakeOptions) {
      const consume = vi.fn()
      const input: ShortcutFixedInput = {
        type: 'keydown',
        gesture: gesture({ code: options.code, repeat: options.repeat ?? false }),
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

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.()
  document.body.replaceChildren()
  document.body.focus()
  vi.restoreAllMocks()
})

describe('hidden card chrome never becomes an arrow stop', () => {
  it('keeps the 0.2.2 copy-expand toggles out of the ring', () => {
    const fixture = mountQuestionCard()
    // The fixture carries both toggles, in the shipped positions, hidden by the shipped rule.
    expect(fixture.questionToggle.isConnected).toBe(true)
    expect(fixture.descriptionToggle.isConnected).toBe(true)
    expect(isShown(fixture.questionToggle)).toBe(false)
    expect(isShown(fixture.descriptionToggle)).toBe(false)

    const ring = focusRing({ kind: 'question', element: fixture.card })
    expect(ring).not.toContain(fixture.questionToggle)
    expect(ring).not.toContain(fixture.descriptionToggle)
    expect(ring).toEqual([
      ...fixture.options,
      fixture.custom,
      fixture.previous,
      fixture.next,
      fixture.skip,
      fixture.primary,
    ])
  })

  it('does not treat a hidden element or a hidden ancestor as shown', () => {
    const fixture = mountQuestionCard()
    expect(isShown(fixture.options[0]!)).toBe(true)
    const wrapper = fixture.card.querySelector('[data-option-row]') as HTMLElement
    wrapper.style.visibility = 'hidden'
    expect(isShown(fixture.options[0]!)).toBe(false)
    wrapper.style.visibility = ''
    wrapper.style.display = 'none'
    expect(isShown(fixture.options[0]!)).toBe(false)
    wrapper.style.display = ''
    fixture.card.setAttribute('hidden', '')
    expect(isShown(fixture.options[0]!)).toBe(false)
  })

  it('reaches the first option from the page body even though a hidden toggle comes first', () => {
    // This is the exact failure: the card opens answered-but-unfocused, so the first arrow
    // press starts outside the ring and used to be computed onto the hidden title toggle.
    // The installer also applies the opening default, so drive `perform` directly here: this
    // case is about the ring geometry, not about what installation does on its own.
    const fixture = mountQuestionCard()
    fixture.check(0)
    fixture.clicks.length = 0
    document.body.focus()

    const handled = perform({ type: 'moveFocus', delta: 1 }, { kind: 'question', element: fixture.card })
    expect(handled).toBe(true)
    expect(document.activeElement).toBe(fixture.options[0])
  })

  it('keeps walking past the position a hidden option toggle occupies', () => {
    // Option B carries the description toggle right after it; walking down from B must reach
    // C instead of stopping on the hidden button between them.
    const fixture = mountQuestionCard()
    const fake = install()
    fixture.options[1]!.focus()
    const consume = fake.emit({ code: 'ArrowDown' })
    expect(document.activeElement).toBe(fixture.options[2])
    expect(consume).toHaveBeenCalledOnce()
  })

  it('walks back up over the hidden title toggle', () => {
    const fixture = mountQuestionCard()
    const fake = install()
    fixture.options[0]!.focus()
    // Up from the first option leaves the body and lands in the footer, not on the toggle.
    fake.emit({ code: 'ArrowUp' })
    expect(document.activeElement).toBe(fixture.primary)
  })
})

describe('a ring stop that cannot take focus never swallows the key', () => {
  it('skips an unfocusable stop and stays usable', () => {
    // A later DSH build could add another control the ring cannot identify as decorative.
    // The guard is behavioural, not selector-based: if focus does not land, try the next stop.
    const fixture = mountQuestionCard()
    const fake = install()
    const frozen = fixture.options[1]!
    vi.spyOn(frozen, 'focus').mockImplementation(() => {})
    fixture.options[0]!.focus()

    const consume = fake.emit({ code: 'ArrowDown' })
    // Option B refused the focus, so the ring continued to option C.
    expect(document.activeElement).toBe(fixture.options[2])
    expect(consume).toHaveBeenCalledOnce()
  })

  it('leaves the key to the page when no stop can take focus', () => {
    const fixture = mountQuestionCard()
    const fake = install()
    const card = { kind: 'question', element: fixture.card } as const
    for (const stop of focusRing(card)) vi.spyOn(stop, 'focus').mockImplementation(() => {})
    fixture.options[0]!.focus()
    const consume = fake.emit({ code: 'ArrowDown' })
    expect(document.activeElement).toBe(fixture.options[0])
    expect(consume).not.toHaveBeenCalled()
  })
})

describe('a recommendation that arrives pre-selected still starts the ring', () => {
  it('puts the ring on the chosen option without changing the answer', () => {
    // DSH 0.2.2 pre-selects a `(Recommended)` choice by itself. The plugin must not overwrite
    // that answer, but the card must not open with the keyboard nowhere either.
    const fixture = mountQuestionCard()
    fixture.check(1)
    fixture.clicks.length = 0
    document.body.focus()

    expect(selectQuestionDefault({ kind: 'question', element: fixture.card }, document)).toBe(true)
    expect(document.activeElement).toBe(fixture.options[1])
    expect(fixture.clicks).toEqual([])
  })

  it('leaves a multi-select preselect unfocused, because a ring there would uncheck it', () => {
    const fixture = mountQuestionCard(document.body, 'm1', 1, true)
    fixture.check(0)
    fixture.clicks.length = 0
    document.body.focus()

    expect(selectQuestionDefault({ kind: 'question', element: fixture.card }, document)).toBe(true)
    expect(document.activeElement).toBe(document.body)
    expect(fixture.clicks).toEqual([])
  })

  it('does not put a ring on an option beside a typed draft', () => {
    const fixture = mountQuestionCard()
    fixture.custom.value = 'my own answer'
    document.body.focus()

    expect(selectQuestionDefault({ kind: 'question', element: fixture.card }, document)).toBe(true)
    expect(document.activeElement).toBe(document.body)
    expect(fixture.clicks).toEqual([])
  })
})

describe('approval decisions ignore hidden buttons', () => {
  it('never clicks a hidden decision button, and still maps position correctly', () => {
    const fixture = mountApprovalCard()
    fixture.allow.style.visibility = 'hidden'
    const fake = install()
    // `1` means "allow once", which is not on screen: it must do nothing at all rather than
    // click something else (the trailing-row position is kept, so `2` is still Reject).
    const allowKey = fake.emit({ code: 'Digit1' })
    expect(fixture.clicks).toEqual([])
    expect(allowKey).not.toHaveBeenCalled()

    const rejectKey = fake.emit({ code: 'Digit2' })
    expect(fixture.clicks).toEqual(['reject'])
    expect(rejectKey).toHaveBeenCalledOnce()
  })
})
