import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ShortcutSettings } from '../../settings.js'

/** Everything the settings card and the interaction gate need: plain values only. */
export interface SettingsSnapshot {
  readonly ready: boolean
  readonly writable: boolean
  readonly enabled: boolean
  readonly saving: boolean
}

export interface SettingsModel {
  getSnapshot(): SettingsSnapshot
  subscribe(listener: () => void): () => void
  setEnabled(enabled: boolean): Promise<void>
  dispose(): void
}

/**
 * Whether the feature is on.
 *
 * The switch defaults to on: only a stored user override can turn it off, so a
 * Host whose Config default has not been reloaded yet cannot silently disable the
 * feature. Field presence, not value comparison, marks the override — that is what
 * `ConfigFormSnapshot.user` documents.
 */
function enabledOf(snapshot: {
  readonly status: string
  readonly value: ShortcutSettings | undefined
  readonly user: unknown
}): boolean {
  if (snapshot.status !== 'ready') return false
  const override = typeof snapshot.user === 'object' && snapshot.user !== null
    ? (snapshot.user as { readonly enabled?: unknown }).enabled
    : undefined
  return override === undefined ? true : snapshot.value?.enabled === true
}

/**
 * Cached observable projection over the plugin's ConfigForm. React reads the snapshot through
 * `useSyncExternalStore`, so the projection must be a stable object between changes.
 */
export function createSettingsModel(form: ConfigForm<ShortcutSettings>): SettingsModel {
  const listeners = new Set<() => void>()
  let saving = false
  let disposed = false
  let snapshot = project()
  function project(): SettingsSnapshot {
    const state = form.getSnapshot()
    return {
      ready: state.status === 'ready',
      writable: state.status === 'ready' && state.writable,
      enabled: enabledOf(state),
      saving,
    }
  }
  function publish(): void {
    if (disposed) return
    snapshot = project()
    for (const listener of [...listeners]) listener()
  }
  const offForm = form.subscribe(publish)
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    async setEnabled(enabled) {
      if (disposed || saving || !snapshot.writable) return
      saving = true
      publish()
      try {
        await form.set('enabled', enabled)
      } finally {
        saving = false
        publish()
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      offForm()
      listeners.clear()
    },
  }
}
