import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** No value imports from `vitest/config` here: loading them would resolve through the
 * `node_modules/vitest` junction, whose target ESM cannot follow under a pnpm layout. */

const root = resolve(fileURLToPath(import.meta.url), '..')
const store = resolve(root, 'node_modules/.pnpm')

/** Under pnpm, point React at its real store path so every consumer shares one CJS
 * instance: the node_modules junctions do not realpath in this environment. A flat
 * (npm) install has single physical copies already and needs no aliases. */
function reactAliases() {
  if (!existsSync(store)) return []
  const dirs = readdirSync(store)
  const entry = (prefix, name, file) => {
    const dir = dirs.find(candidate => candidate.startsWith(prefix))
    if (dir === undefined) throw new Error(`vitest.config: ${name} not found under node_modules/.pnpm`)
    return resolve(store, dir, 'node_modules', name, file)
  }
  return [
    { find: /^react$/, replacement: entry('react@', 'react', 'index.js') },
    { find: /^react\/jsx-runtime$/, replacement: entry('react@', 'react', 'jsx-runtime.js') },
    { find: /^react-dom$/, replacement: entry('react-dom@', 'react-dom', 'index.js') },
    { find: /^react-dom\/client$/, replacement: entry('react-dom@', 'react-dom', 'client.js') },
  ]
}

export default {
  test: {
    // The sandbox forbids process spawns (the default forks pool needs them).
    pool: 'threads',
    setupFiles: ['./tests/setup.ts'],
    server: {
      // Never let Vite transform React: external + store-path aliases (pnpm) or flat
      // physical copies (npm) keep test files, components, and Testing Library on one
      // shared CJS instance.
      deps: { external: [/react/, /scheduler/, /testing-library/] },
    },
  },
  resolve: {
    alias: reactAliases(),
  },
}
