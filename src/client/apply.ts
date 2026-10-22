import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-shortcuts/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { SettingsCard } from './components/SettingsCard.js'
import { createSettingsModel } from './settings/model.js'
import { installCardKeys } from './keyboard/install.js'
import { NS, en, zh } from './locales.js'
import type { ShortcutSettings } from '../settings.js'
import { SHORTCUTS_SETTINGS_NAMESPACE } from '../settings-namespace.js'

const PACKAGE_NAME = '@hzy/dsh-card-keys'

/** Only services this plugin truly needs; `shortcuts` is optional so a shell without it still loads. */
export const inject = ['slots', 'locale', 'configForms'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'card-keys: dictionaries')
  const t = ctx.locale.bind(NS)
  const form = ctx.configForms.get<ShortcutSettings>(SHORTCUTS_SETTINGS_NAMESPACE)
  const model = createSettingsModel(form)
  ctx.effect(() => () => model.dispose(), 'card-keys: settings model')
  const props = () => ({ model, t: (key: string) => t(key as never) })

  // The plugin's page in the Plugins section: one switch, the only stored preference.
  ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config', key: PACKAGE_NAME, locale: NS, inject: props,
  }, SettingsCard)), 'card-keys: settings entry')

  // Keyboard control is additive: it never replaces a shipped card, it drives the card
  // that is already on screen through DSH's arbitrated fixed-action channel. Off means
  // no contribution at all — neither the keys nor the official settings row.
  ctx.inject(['shortcuts'], scope => {
    scope.effect(() => {
      let mounted: (() => void) | undefined
      const sync = (): void => {
        const enabled = model.getSnapshot().enabled
        if (enabled && mounted === undefined) {
          mounted = installCardKeys(scope.shortcuts, { label: () => t('card.selectKeys') })
        }
        else if (!enabled && mounted !== undefined) { mounted(); mounted = undefined }
      }
      sync()
      const off = model.subscribe(sync)
      return () => { off(); mounted?.(); mounted = undefined }
    }, 'card-keys: interaction keys')
  })
}
