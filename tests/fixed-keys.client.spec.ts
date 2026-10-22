import { describe, expect, it } from 'vitest'
import {
  SELECT_OPTION_COMMAND,
  createSelectOptionCommand,
  digitIndex,
  isPlainGesture,
} from '../src/client/keyboard/fixed.js'
import { gesture } from './gesture.js'

describe('digit mapping', () => {
  it('maps the main digit row to option indexes', () => {
    expect(digitIndex('Digit1')).toBe(0)
    expect(digitIndex('Digit9')).toBe(8)
  })

  it('ignores numpad codes, zero, and non-digit keys', () => {
    // A numpad digit reports `NumpadN`, which may be a cursor key with NumLock off.
    expect(digitIndex('Numpad1')).toBeNull()
    expect(digitIndex('Digit0')).toBeNull()
    expect(digitIndex('KeyA')).toBeNull()
    expect(digitIndex('Enter')).toBeNull()
  })
})

describe('gesture modifiers', () => {
  it('treats a bare press as plain and every modifier as owned elsewhere', () => {
    expect(isPlainGesture(gesture())).toBe(true)
    expect(isPlainGesture(gesture({ shift: true }))).toBe(false)
    expect(isPlainGesture(gesture({ control: true }))).toBe(false)
    expect(isPlainGesture(gesture({ alt: true }))).toBe(false)
    expect(isPlainGesture(gesture({ meta: true }))).toBe(false)
  })
})

describe('official fixed action row', () => {
  it('reserves the digit row under the approval group', () => {
    const command = createSelectOptionCommand(() => '选择')
    expect(command.id).toBe(SELECT_OPTION_COMMAND)
    expect(command.group).toBe('approval')
    expect(command.label()).toBe('选择')
    expect(command.keys).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(command.bindings.map(binding => binding.code)).toEqual([
      'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9',
    ])
    expect(command.bindings.every(binding => binding.modifiers.length === 0)).toBe(true)
  })
})
