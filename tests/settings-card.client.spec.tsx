// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { asForm, fakeForm } from './fake-form.js'
import { SettingsCard } from '../src/client/components/SettingsCard.js'
import { createSettingsModel } from '../src/client/settings/model.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Switch: (props: { label: string; checked: boolean; disabled?: boolean; onChange: (next: boolean) => void }) => (
    <button role="switch" aria-checked={props.checked} disabled={props.disabled === true}
      onClick={() => props.onChange(!props.checked)}>{props.label}</button>
  ),
}))

const t = (key: string) => ({
  'settings.summary': '问题与审批卡片的键盘操作。',
  'settings.title': '卡片键盘操作',
  'settings.enable': '启用卡片键盘操作',
  'settings.hint': '提示',
  'settings.unavailable': '不可用',
}[key] ?? key)

afterEach(cleanup)

describe('settings card', () => {
  it('shows a plain summary line on the summary view', () => {
    const model = { getSnapshot: () => ({ ready: true, writable: true, enabled: true, saving: false }),
      subscribe: () => () => {}, setEnabled: vi.fn(async () => {}), dispose: () => {} }
    const { unmount } = render(<SettingsCard model={model} t={t} view="summary" />)
    expect(screen.getByText('问题与审批卡片的键盘操作。')).toBeTruthy()
    unmount()
  })

  it('shows the switch on by default and writes a user override', async () => {
    // No user layer yet: the feature is on even though the resolved value is false.
    const form = fakeForm({ status: 'ready', writable: true, value: { enabled: false } })
    const model = createSettingsModel(asForm(form))
    render(<SettingsCard model={model} t={t} view="page" />)
    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(1)
    expect(switches[0]!.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(switches[0]!)

    await waitFor(() => expect(switches[0]!.getAttribute('aria-checked')).toBe('false'))
    expect(form.getSnapshot().user).toEqual({ enabled: false })
    model.dispose()
  })

  it('toggles back on through the model', async () => {
    const form = fakeForm({
      status: 'ready', writable: true, value: { enabled: false }, user: { enabled: false },
    })
    const model = createSettingsModel(asForm(form))
    render(<SettingsCard model={model} t={t} view="page" />)
    const toggle = screen.getByRole('switch')
    expect(toggle.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(toggle)

    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'))
    model.dispose()
  })

  it('disables the switch while the form is not writable and says why', () => {
    const form = fakeForm({ status: 'loading', writable: false })
    const model = createSettingsModel(asForm(form))
    render(<SettingsCard model={model} t={t} view="page" />)
    // The mock switch renders disabled={true} as a disabled attribute.
    expect(screen.getByRole('switch').hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('不可用')).toBeTruthy()
    model.dispose()
  })
})
