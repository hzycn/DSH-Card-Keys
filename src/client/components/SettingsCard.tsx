import React, { useSyncExternalStore } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsModel } from '../settings/model.js'

export interface SettingsCardProps {
  readonly model: SettingsModel
  readonly t: (key: string) => string
  /** The plugin page renders controls; the bundle summary renders one plain line. */
  readonly view: 'summary' | 'page'
}

/** The whole settings surface: one switch that enables or disables the keyboard cards. */
export function SettingsCard({ model, t, view }: SettingsCardProps): React.ReactElement {
  if (view === 'summary') return <>{t('settings.summary')}</>
  return <SettingsControls model={model} t={t} />
}

function SettingsControls({ model, t }: { readonly model: SettingsModel; readonly t: (key: string) => string }): React.ReactElement {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot)
  return <section aria-label={t('settings.title')}>
    <Switch label={t('settings.enable')} checked={state.enabled} disabled={!state.writable || state.saving}
      onChange={enabled => { void model.setEnabled(enabled) }} />
    <p>{t('settings.hint')}</p>
    {!state.writable ? <p role="status">{t('settings.unavailable')}</p> : null}
  </section>
}
