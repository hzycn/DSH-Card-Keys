import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

export { SHORTCUTS_SETTINGS_NAMESPACE, type ShortcutSettings } from './settings.js'

/** DSH discovers settings from the Host entry's Config; volatile fields update without remounting it. */
export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
})

/** Keep the custom settings card as the single settings presentation. */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
}
