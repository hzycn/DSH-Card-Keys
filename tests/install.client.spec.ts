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

function install(overrides: Partial<EmitOptions> = {}) {
  const fake = fakeShortcuts()
  const dispose = installCardKeys(fake.shortcuts, { label: () => 'Cards: select option with number keys' })
  return { ...fake, dispose, ...overrides }
}

afterEach(() => {
  document.body.replaceChildren()
  document.body.focus()
})

describe('question card keyboard control', () => {
  it('selects the option matching the number key and consumes it', () => {
    const fixture = mountQuestionCard()
    const fake = install()
    const consume = fake.emit({ gesture: { code: 'Digit2' } })
    expect(fixture.clicks).toEqual(['option-2'])
    expect(document.activeElement).toBe(fixture.options[1])
    expect(consume).toHaveBeenCalledOnce()
  })

  it('leaves numbers beyond the visible options to the page', () => {
    const fixture = mountQuestionCard()
    const fake = install()
    const consume = fake.emit({ gesture: { code: 'Digit9' } })
    expect(fixture.clicks).toEqual([])
    expect(consume).not.toHaveBeenCalled()
  })

  it('moves focus with the arrow keys and wraps around', () => {
    const fixture = mountQuestionCard()
    const fake = install()
    fake.emit({ gesture: { code: 'ArrowDown' } })
    expect(document.activeElement).toBe(fixture.options[0])
    fake.emit({ gesture: { code: 'ArrowDown' } })
    expect(document.activeElement).toBe(fixture.options[1])
    fake.emit({ gesture: { code: 'ArrowUp' } })
    expect(document.activeElement).toBe(fixture.options[0])
    fake.emit({ gesture: { code: 'ArrowUp' } })
    expect(document.activeElement).toBe(fixture.primary)
  })

  it('confirms with Enter when focus is outside the card', () => {
    const fixture = mountQuestionCard()
    const fake = install()
    fake.emit({ gesture: { code: 'Enter' } })
    expect(fixture.clicks).toEqual(['primary'])
  })

  it('lets a focused control keep Enter', () => {
    const fixture = mountQuestionCard()
    fixture.options[0]!.focus()
    const fake = install()
    const consume = fake.emit({ gesture: { code: 'Enter' } })
    expect(fixture.clicks).toEqual([])
    expect(consume).not.toHaveBeenCalled()
  })

  it('closes the card with Escape', () => {
    const fixture = mountQuestionCard()
    const fake = install()
    fake.emit({ gesture: { code: 'Escape' } })
    expect(fixture.clicks).toEqual(['close'])
  })
})

describe('approval card keyboard control', () => {
  it('allows once with 1 and rejects with 2', () => {
    const fixture = mountApprovalCard()
    const fake = install()
    fake.emit({ gesture: { code: 'Digit1' } })
    expect(fixture.clicks).toEqual(['allow'])
    fake.emit({ gesture: { code: 'Digit2' } })
    expect(fixture.clicks).toEqual(['allow', 'reject'])
  })

  it('never confirms or dismisses an approval from the page', () => {
    const fixture = mountApprovalCard()
    const fake = install()
    const enter = fake.emit({ gesture: { code: 'Enter' } })
    const escape = fake.emit({ gesture: { code: 'Escape' } })
    expect(fixture.clicks).toEqual([])
    expect(enter).not.toHaveBeenCalled()
    expect(escape).not.toHaveBeenCalled()
  })
})

describe('input ownership', () => {
  it('ignores keys while a text field or modal owns the keyboard', () => {
    const fixture = mountQuestionCard()
    fixture.custom.focus()
    const fake = install()
    expect(fake.emit({ gesture: { code: 'Digit2' }, region: 'editable' })).not.toHaveBeenCalled()
    expect(fake.emit({ gesture: { code: 'Digit2' }, modal: 'settings' })).not.toHaveBeenCalled()
    expect(fixture.clicks).toEqual([])
  })

  it('ignores modified, repeated, and already-handled keys', () => {
    const fixture = mountQuestionCard()
    const fake = install()
    for (const overrides of [
      { shift: true }, { control: true }, { alt: true }, { meta: true },
      { repeat: true }, { composing: true }, { defaultPrevented: true },
    ]) {
      expect(fake.emit({ gesture: { code: 'Digit2', ...overrides } })).not.toHaveBeenCalled()
    }
    expect(fixture.clicks).toEqual([])
  })

  it('ignores the sequence reset frame', () => {
    mountQuestionCard()
    const fake = install()
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
})
