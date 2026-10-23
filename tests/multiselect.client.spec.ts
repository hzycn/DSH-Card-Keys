// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ShortcutFixedCommand, ShortcutFixedInput, Shortcuts } from '@deepseek-ai/dsh-client-shortcuts/client'
import { isMultiSelect, optionButtons } from '../src/client/keyboard/dom.js'
import { installCardKeys } from '../src/client/keyboard/install.js'
import { planKey } from '../src/client/keyboard/plan.js'
import type { KeyFacts } from '../src/client/keyboard/plan.js'
import { gesture } from './gesture.js'
import { mountQuestionCard } from './card-fixture.js'

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

function install() {
  const fake = fakeShortcuts()
  disposers.push(installCardKeys(fake.shortcuts, { label: () => 'Cards: select option with number keys' }))
  return fake
}

/** Multi-select card whose options toggle on click, like the shipped `choose` handler. */
function mountMultiSelect() {
  const fixture = mountQuestionCard(document.body, 'm1', 1, true)
  for (const option of fixture.options) {
    option.addEventListener('click', () => {
      option.setAttribute('aria-checked', String(option.getAttribute('aria-checked') !== 'true'))
    })
  }
  return fixture
}

function facts(overrides: Partial<KeyFacts> = {}): KeyFacts {
  return {
    code: 'Space',
    region: 'page',
    modal: null,
    composing: false,
    defaultPrevented: false,
    repeat: false,
    control: false,
    alt: false,
    shift: false,
    meta: false,
    cardKind: 'question',
    optionCount: 3,
    multiSelect: true,
    focusInsideCard: true,
    focusIsControl: true,
    ...overrides,
  }
}

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.()
  document.body.replaceChildren()
  document.body.focus()
})

describe('multi-select detection', () => {
  it('recognises the shipped multi-select markup', () => {
    expect(isMultiSelect(mountMultiSelect().card)).toBe(true)
  })

  it('treats a radiogroup as single-select', () => {
    expect(isMultiSelect(mountQuestionCard().card)).toBe(false)
  })

  it('finds checkbox options the same way as radio options', () => {
    const fixture = mountMultiSelect()
    expect(optionButtons(fixture.card)).toEqual(fixture.options)
    expect(fixture.options[0]?.getAttribute('role')).toBe('checkbox')
  })
})

describe('arrows only move the ring in a multi-select question', () => {
  it('moves focus without toggling anything', () => {
    // Browsing with the arrows must not check every option passed over: in a multi-select
    // question an option is a toggle, so selecting while moving would be destructive.
    const fixture = mountMultiSelect()
    const fake = install()
    fixture.options[0]!.focus()
    fake.emit('ArrowDown')
    expect(document.activeElement).toBe(fixture.options[1])
    expect(fixture.clicks).toEqual([])
    expect(fixture.options[1]?.getAttribute('aria-checked')).toBe('false')
  })

  it('walks several options with no accidental selection', () => {
    const fixture = mountMultiSelect()
    const fake = install()
    fixture.options[0]!.focus()
    fake.emit('ArrowDown')
    fake.emit('ArrowDown')
    fake.emit('ArrowUp')
    expect(document.activeElement).toBe(fixture.options[1])
    expect(fixture.clicks).toEqual([])
  })

  it('still selects with a digit, which is an explicit choice', () => {
    const fixture = mountMultiSelect()
    const fake = install()
    const consume = fake.emit('Digit2')
    expect(fixture.clicks).toEqual(['option-2'])
    expect(consume).toHaveBeenCalledOnce()
  })
})

describe('Space toggles the focused option', () => {
  it('checks the option the ring is on', () => {
    const fixture = mountMultiSelect()
    const fake = install()
    fixture.options[1]!.focus()
    const consume = fake.emit('Space')
    expect(fixture.clicks).toEqual(['option-2'])
    expect(fixture.options[1]?.getAttribute('aria-checked')).toBe('true')
    expect(consume).toHaveBeenCalledOnce()
  })

  it('checks a second option without clearing the first', () => {
    const fixture = mountMultiSelect()
    const fake = install()
    fixture.options[0]!.focus()
    fake.emit('Space')
    fake.emit('ArrowDown')
    fake.emit('Space')
    expect(fixture.clicks).toEqual(['option-1', 'option-2'])
    expect(fixture.options[0]?.getAttribute('aria-checked')).toBe('true')
    expect(fixture.options[1]?.getAttribute('aria-checked')).toBe('true')
  })

  it('unchecks an option that was already checked', () => {
    const fixture = mountMultiSelect()
    const fake = install()
    fixture.options[0]!.focus()
    fake.emit('Space')
    fake.emit('Space')
    expect(fixture.clicks).toEqual(['option-1', 'option-1'])
    expect(fixture.options[0]?.getAttribute('aria-checked')).toBe('false')
  })

  it('leaves Space alone when no option has the ring', () => {
    mountMultiSelect()
    const fake = install()
    const consume = fake.emit('Space')
    expect(consume).not.toHaveBeenCalled()
  })

  it('leaves Space alone on a single-answer question', () => {
    // A single-answer option is chosen by landing on it, so Space has no meaning there.
    const consume = planKey(facts({ multiSelect: false }))
    expect(consume).toEqual({ type: 'none' })
  })
})
