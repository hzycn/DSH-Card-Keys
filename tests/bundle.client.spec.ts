import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

/** The browser artifact only exists after `pnpm run bundle`; skip before the first build. */
const bundle = new URL('../lib/client.js', import.meta.url)
const built = existsSync(bundle)

interface LoaderRecord {
  readonly id: string
  readonly factory: (require: (specifier: string) => unknown) => Record<string, unknown>
}

describe.skipIf(!built)('built browser bundle', () => {
  it('registers its package id and materializes apply/inject', () => {
    const records: LoaderRecord[] = []
    const window = { __ModuleLoader__: { load: (record: LoaderRecord) => { records.push(record) } } }
    new Function('window', readFileSync(bundle, 'utf8'))(window)

    expect(records.map(record => record.id)).toEqual(['@hzy/dsh-card-keys'])
    const record = records[0]!

    // Every value import must be a DSH platform module; the bundle purity gate
    // rejects anything else at build time, so this also documents the runtime deps.
    const requireFromRepo = createRequire(import.meta.url)
    const primitives = new Proxy({}, { get: () => () => null })
    const exports = record.factory((specifier: string) => {
      if (specifier === 'react') return requireFromRepo('react')
      if (specifier === 'react/jsx-runtime') return requireFromRepo('react/jsx-runtime')
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      throw new Error(`unexpected platform module: ${specifier}`)
    })

    expect(Object.keys(exports).sort()).toEqual(['apply', 'inject'])
    expect(typeof exports.apply).toBe('function')
    expect(exports.inject).toEqual(['slots', 'locale', 'configForms'])
  })
})
