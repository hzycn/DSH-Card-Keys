import z from '@deepseek-ai/schemastery'

/** The plugin has exactly one preference: whether the keyboard cards are enabled. */
export interface ShortcutSettings {
  readonly enabled: boolean
}

export { SHORTCUTS_SETTINGS_NAMESPACE } from './settings-namespace.js'
