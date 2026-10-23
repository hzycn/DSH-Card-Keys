// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ShortcutFixedCommand, ShortcutFixedInput, ShortcutGesture, Shortcuts } from '@deepseek-ai/dsh-client-shortcuts/client'
import { installCardKeys } from '../src/client/keyboard/install.js'
import { gesture } from './gesture.js'
import { mountApprovalCard, mountQuestionCard } from './card-fixture.js'

interface EmitOptions {
  readonly gesture?: Partial<ShortcutGesture>
  readonly region?: 'page' | 'editable' | 'terminal'
  readonly modal?: string | null
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
    commands,
    listeners,
    emit(options: EmitOptions = {}) {
      const consume = vi.fn()
      const input: ShortcutFixedInput = {
        type: 'keydown',
        gesture: gesture(options.gesture),
        context: { region: options.region ?? 'page', modal: options.modal ?? null, target: null },
        consume,
      }
      for (const listener of [...listeners]) listener(input)
      return consume
    },
    reset() {
      for (const listener of [...listeners]) listener({ type: 'reset' })
    },
  }
}

/** Installations live until the end of a test: a leftover observer would act on the next test's DOM. */
const disposers: (() => void)[] = []

function install(overrides: Partial<EmitOptions> = {}) {
  const fake = fakeShortcuts()
  const dispose = installCardKeys(fake.shortcuts, { label: () => 'Cards: select option with number keys' })
  disposers.push(dispose)
  return { ...fake, dispose, ...overrides }
}

/**
 * Mount a card, install the layer, then forget what installing did on its own.
 *
 * These specs cover what a *key press* does, so the default that installation applies —
 * an approval's initial focus, a question's preselected first option — is cleared first.
 * `tests/approval-focus.client.spec.ts` and `tests/question-default.client.spec.ts` cover
 * those defaults directly.
 */
function installWith<T extends { readonly clicks: string[] }>(mount: () => T): { fixture: T } & ReturnType<typeof install> {
  const fixture = mount()
  const fake = install()
  fixture.clicks.length = 0
  return { ...fake, fixture }
}

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.()
  document.body.replaceChildren()
  document.body.focus()
})

describe('question card keyboard control', () => {
  it('selects the option matching the number key and consumes it', () => {
    const { fixture, ...fake } = installWith(() => mountQuestionCard())
    const consume = fake.emit({ gesture: { code: 'Digit2' } })
    expect(fixture.clicks).toEqual(['option-2'])
    expect(document.activeElement).toBe(fixture.options[1])
    expect(consume).toHaveBeenCalledOnce()
  })

  it('leaves numbers beyond the visible options to the page', () => {
    const { fixture, ...fake } = installWith(() => mountQuestionCard())
    const consume = fake.emit({ gesture: { code: 'Digit9' } })
    expect(fixture.clicks).toEqual([])
    expect(consume).not.toHaveBeenCalled()
  })

  it('walks the ring from the defaulted option and wraps around', () => {
    // Installing puts the ring on option 1, so the first ArrowDown goes to option 2.
    const { fixture, ...fake } = installWith(() => mountQuestionCard())
    expect(document.activeElement).toBe(fixture.options[0])
    fake.emit({ gesture: { code: 'ArrowDown' } })
    expect(document.activeElement).toBe(fixture.options[1])
    fake.emit({ gesture: { code: 'ArrowDown' } })
    expect(document.activeElement).toBe(fixture.options[2])
    fake.emit({ gesture: { code: 'ArrowUp' } })
    expect(document.activeElement).toBe(fixture.options[1])
    // Walking back past the first option wraps to the end of the ring.
    fake.emit({ gesture: { code: 'ArrowUp' } })
    fake.emit({ gesture: { code: 'ArrowUp' } })
    expect(document.activeElement).toBe(fixture.primary)
  })

  it('selects the option the arrows land on, so the ring and the answer agree', () => {
    const { fixture, ...fake } = installWith(() => mountQuestionCard())
    fake.emit({ gesture: { code: 'ArrowDown' } })
    expect(document.activeElement).toBe(fixture.options[1])
    expect(fixture.clicks).toEqual(['option-2'])
    fake.emit({ gesture: { code: 'ArrowDown' } })
    expect(document.activeElement).toBe(fixture.options[2])
    expect(fixture.clicks).toEqual(['option-2', 'option-3'])
    fake.emit({ gesture: { code: 'ArrowRight' } })
    expect(fixture.clicks).toEqual(['option-2', 'option-3'])
  })

  it('does not click footer controls the arrows land on', () => {
    // The ring continues into the pager and the actions; those must only take focus, or
    // arrowing past the last option would submit the card.
    const { fixture, ...fake } = installWith(() => mountQuestionCard())
    fake.emit({ gesture: { code: 'ArrowUp' } })
    expect(document.activeElement).toBe(fixture.primary)
    expect(fixture.clicks).toEqual([])
  })

  it('confirms with Enter when focus is outside the card', () => {
    const { fixture, ...fake } = installWith(() => mountQuestionCard())
    // The installer leaves the ring on option 1; step off the card to exercise `activate`.
    fixture.options[0]!.blur()
    ;(document.activeElement as HTMLElement | null)?.blur()
    fake.emit({ gesture: { code: 'Enter' } })
    expect(fixture.clicks).toEqual(['primary'])
  })

  it('does not skip an unanswered question when Enter finds nothing to confirm', () => {
    // With nothing selected the shipped card disables Submit/Next. Enter must do nothing —
    // falling through to `Skip` would silently skip a question the user never answered.
    const { fixture, ...fake } = installWith(() => mountQuestionCard())
    fixture.primary.disabled = true
    fixture.options[0]!.blur()
    ;(document.activeElement as HTMLElement | null)?.blur()
    fake.emit({ gesture: { code: 'Enter' } })
    expect(fixture.clicks).toEqual([])
    expect(fixture.clicks).not.toContain('skip')
  })

  it('lets a focused control keep Enter', () => {
    const { fixture, ...fake } = installWith(() => mountQuestionCard())
    fixture.options[0]!.focus()
    const consume = fake.emit({ gesture: { code: 'Enter' } })
    expect(fixture.clicks).toEqual([])
    expect(consume).not.toHaveBeenCalled()
  })

  it('closes the card with Escape', () => {
    const { fixture, ...fake } = installWith(() => mountQuestionCard())
    fake.emit({ gesture: { code: 'Escape' } })
    expect(fixture.clicks).toEqual(['close'])
  })
})

describe('approval card keyboard control', () => {
  it('allows once with 1 and rejects with 2', () => {
    const { fixture, ...fake } = installWith(() => mountApprovalCard())
    fake.emit({ gesture: { code: 'Digit1' } })
    expect(fixture.clicks).toEqual(['allow'])
    fake.emit({ gesture: { code: 'Digit2' } })
    expect(fixture.clicks).toEqual(['allow', 'reject'])
  })

  it('never confirms or dismisses an approval from the page', () => {
    const { fixture, ...fake } = installWith(() => mountApprovalCard())
    const enter = fake.emit({ gesture: { code: 'Enter' } })
    const escape = fake.emit({ gesture: { code: 'Escape' } })
    expect(fixture.clicks).toEqual([])
    expect(enter).not.toHaveBeenCalled()
    expect(escape).not.toHaveBeenCalled()
  })
})

describe('input ownership', () => {
  it('ignores keys while a text field or modal owns the keyboard', () => {
    const { fixture, ...fake } = installWith(() => mountQuestionCard())
    fixture.custom.focus()
    expect(fake.emit({ gesture: { code: 'Digit2' }, region: 'editable' })).not.toHaveBeenCalled()
    expect(fake.emit({ gesture: { code: 'Digit2' }, modal: 'settings' })).not.toHaveBeenCalled()
    expect(fixture.clicks).toEqual([])
  })

  it('ignores modified, repeated, and already-handled keys', () => {
    const { fixture, ...fake } = installWith(() => mountQuestionCard())
    for (const overrides of [
      { shift: true }, { control: true }, { alt: true }, { meta: true },
      { repeat: true }, { composing: true }, { defaultPrevented: true },
    ]) {
      expect(fake.emit({ gesture: { code: 'Digit2', ...overrides } })).not.toHaveBeenCalled()
    }
    expect(fixture.clicks).toEqual([])
  })

  it('ignores the sequence reset frame', () => {
    const { ...fake } = installWith(() => mountQuestionCard())
    expect(() => { fake.reset() }).not.toThrow()
  })
})

describe('installation', () => {
  it('contributes the official digit row while installed and withdraws it on dispose', () => {
    const fake = install()
    expect(fake.commands.map(command => command.id)).toEqual(['cardkeys.selectOption'])
    expect(fake.listeners.size).toBe(1)
    fake.dispose()
    expect(fake.commands).toEqual([])
    expect(fake.listeners.size).toBe(0)
  })

  it('does nothing without a mounted card', () => {
    const fake = install()
    expect(fake.emit({ gesture: { code: 'Digit1' } })).not.toHaveBeenCalled()
  })

  it('selects the first option of a card that autofocuses its own answer field', async () => {
    // The installer wires the two defaults together. Its callback must return the helper's
    // result: `false` means "retry", and a wrapper that swallowed it wrote the card off after
    // the card's own autofocus made the first attempt decline.
    const fixture = mountQuestionCard()
    fixture.custom.focus()
    const fake = install()
    await new Promise<void>(resolve => { queueMicrotask(resolve) })
    await new Promise<void>(resolve => { requestAnimationFrame(() => { resolve() }) })
    await new Promise<void>(resolve => { queueMicrotask(resolve) })
    expect(fixture.clicks).toContain('option-1')
  })
})
