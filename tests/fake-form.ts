import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ShortcutSettings } from '../src/settings.js'
import { createSettingsModel } from '../src/client/settings/model.js'

export interface FormSnapshot {
  readonly status: 'loading' | 'ready'
  readonly writable: boolean
  readonly value?: ShortcutSettings
  /** Raw user layer; presence of `enabled` marks an explicit override. */
  readonly user?: Readonly<Record<string, unknown>>
}

/** Minimal ConfigForm stand-in: snapshot projection plus change notifications. */
export function fakeForm(initial: FormSnapshot) {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: async (field: string, value: boolean) => {
      if (field !== 'enabled' || snapshot.status !== 'ready' || !snapshot.writable) return false
      snapshot = { ...snapshot, value: { enabled: value }, user: { ...(snapshot.user ?? {}), enabled: value } }
      for (const listener of [...listeners]) listener()
      return true
    },
    /** Simulate a change written by someone else. */
    emit(next: FormSnapshot) {
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
  }
}

export type FakeForm = ReturnType<typeof fakeForm>

/** The model only needs the structural shape, not the full official type. */
export function asForm(fake: FakeForm): ConfigForm<ShortcutSettings> {
  return fake as unknown as ConfigForm<ShortcutSettings>
}
