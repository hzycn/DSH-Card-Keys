import type { ShortcutGesture } from '@deepseek-ai/dsh-client-shortcuts/client'

/** One bare digit-2 gesture, with overrides for the field under test. */
export function gesture(overrides: Partial<ShortcutGesture> = {}): ShortcutGesture {
  return {
    code: 'Digit2',
    control: false,
    alt: false,
    shift: false,
    meta: false,
    repeat: false,
    composing: false,
    defaultPrevented: false,
    ...overrides,
  }
}
