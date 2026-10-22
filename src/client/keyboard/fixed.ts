/** Official fixed-action integration: the number keys reserve their row and deliver input.
 *
 * The keys ride DSH's read-only fixed-action channel: `registerFixed` lists the row in
 * the official keyboard settings (approval group) only while this plugin is enabled,
 * and `observeFixedInput` receives already-arbitrated input. The handler judges the
 * mounted interaction card and consumes only what it actually performs, so typing,
 * scrolling, and every other page behavior stay untouched. */

import type {
  ShortcutCommandId,
  ShortcutFixedCommand,
  ShortcutFixedInput,
  ShortcutGesture,
} from '@deepseek-ai/dsh-client-shortcuts/client'
import { digitFromCode } from './plan.js'

export const SELECT_OPTION_COMMAND = 'cardkeys.selectOption' as ShortcutCommandId

/** Digit gesture code → 0-based index, or null for anything else. */
export const digitIndex = digitFromCode

/** Whether a gesture is a bare key press the cards may own. */
export function isPlainGesture(gesture: ShortcutGesture): boolean {
  return !gesture.control && !gesture.alt && !gesture.shift && !gesture.meta
}

/** The official settings row: one action, nine reserved digit combinations. */
export function createSelectOptionCommand(label: () => string): ShortcutFixedCommand {
  return {
    id: SELECT_OPTION_COMMAND,
    label,
    keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    bindings: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit => ({
      code: `Digit${String(digit)}`,
      modifiers: [],
    })) as unknown as ShortcutFixedCommand['bindings'],
    group: 'approval',
  }
}

export type FixedKeyInput = Extract<ShortcutFixedInput, { type: 'keydown' }>
