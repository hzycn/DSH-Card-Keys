import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  readonly name: string
  readonly version: string
  readonly exports: Record<string, unknown>
  readonly files: readonly string[]
  readonly dependencies: Record<string, string>
  readonly peerDependencies: Record<string, string>
  readonly dsh: { readonly client: { readonly inject: readonly string[] } }
}

describe('package shape', () => {
  it('keeps exports aligned with the published file list', () => {
    expect(Object.keys(manifest.exports)).toEqual(['.', './client', './src/*', './package.json'])
    expect(manifest.files).toEqual(['lib/index.js', 'lib/client.js', 'lib/types/**/*.d.ts', 'cordis.patch.yml'])
  })

  it('registers the bundle under its settings namespace', () => {
    const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    expect(patch).toContain('id: dsh-card-keys')
    expect(patch).toContain(`name: '${manifest.name}'`)
  })

  it('stays on the two-feature surface with no removed dependencies', () => {
    expect(manifest.dependencies).not.toHaveProperty('@iconify/react')
    expect(manifest.dependencies).not.toHaveProperty('@iconify-icons/lucide')
    expect(manifest.peerDependencies).not.toHaveProperty('@deepseek-ai/dsh-invariants')
    // The official shortcuts service is required again, but only for the fixed-action
    // channel (registerFixed + observeFixedInput); the quick panel stays gone.
    expect(manifest.dsh.client.inject).toContain('@deepseek-ai/dsh-client-shortcuts')
    expect(manifest.dsh.client.inject).toContain('@deepseek-ai/dsh-client-ui-settings')
  })
})
