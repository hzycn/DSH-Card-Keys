import { describe, expect, it } from 'vitest'
import { asForm, fakeForm } from './fake-form.js'
import { createSettingsModel } from '../src/client/settings/model.js'

describe('settings model', () => {
  it('projects ready, writable, and enabled from the form snapshot', () => {
    const model = createSettingsModel(asForm(fakeForm({ status: 'ready', writable: true, value: { enabled: true } })))
    expect(model.getSnapshot()).toEqual({ ready: true, writable: true, enabled: true, saving: false })
    model.dispose()
  })

  it('reports a loading form as not ready and not enabled', () => {
    const model = createSettingsModel(asForm(fakeForm({ status: 'loading', writable: false })))
    expect(model.getSnapshot()).toEqual({ ready: false, writable: false, enabled: false, saving: false })
    model.dispose()
  })

  it('stays on when the user never touched the switch', () => {
    // A Host whose Config default has not been reloaded yet still resolves `false`
    // here; field PRESENCE, not the value, marks an override, so the feature stays on.
    const model = createSettingsModel(asForm(fakeForm({ status: 'ready', writable: true, value: { enabled: false } })))
    expect(model.getSnapshot().enabled).toBe(true)
    model.dispose()
  })

  it('follows an explicit user override', () => {
    const off = createSettingsModel(asForm(fakeForm({
      status: 'ready', writable: true, value: { enabled: false }, user: { enabled: false },
    })))
    expect(off.getSnapshot().enabled).toBe(false)
    off.dispose()

    const on = createSettingsModel(asForm(fakeForm({
      status: 'ready', writable: true, value: { enabled: true }, user: { enabled: true },
    })))
    expect(on.getSnapshot().enabled).toBe(true)
    on.dispose()
  })

  it('writes the switch through the form and republishes', async () => {
    const form = fakeForm({
      status: 'ready', writable: true, value: { enabled: true }, user: { enabled: true },
    })
    const model = createSettingsModel(asForm(form))
    const seen: boolean[] = []
    model.subscribe(() => { seen.push(model.getSnapshot().enabled) })

    await model.setEnabled(false)

    expect(model.getSnapshot().enabled).toBe(false)
    // One publish when saving starts, one from the form change, one when saving ends.
    expect(seen).toEqual([true, false, false])
    model.dispose()
  })

  it('refuses writes while the form is not writable', async () => {
    const form = fakeForm({ status: 'loading', writable: false })
    const model = createSettingsModel(asForm(form))

    await model.setEnabled(true)

    expect(model.getSnapshot().enabled).toBe(false)
    expect(form.getSnapshot().value).toBeUndefined()
    model.dispose()
  })

  it('follows external form changes and stops after dispose', () => {
    const form = fakeForm({ status: 'ready', writable: true, value: { enabled: false }, user: { enabled: false } })
    const model = createSettingsModel(asForm(form))
    model.dispose()

    form.emit({ status: 'ready', writable: true, value: { enabled: true }, user: { enabled: true } })

    expect(model.getSnapshot().enabled).toBe(false)
  })
})
