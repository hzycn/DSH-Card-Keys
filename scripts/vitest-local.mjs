/** Local-only Vitest entry for sandboxed shells.
 *
 * The DSH file sandbox forbids process spawns. Two code paths would need them:
 * 1. Vitest's default forks pool (avoided by running with `--pool=threads`);
 * 2. Vite's `optimizeSafeRealPathSync` probe, which shells out to `net use` while
 *    loading any Vite/Vitest config file when the project path contains non-ASCII
 *    characters (this checkout does).
 *
 * For (2) the wrapper hijacks the first `fs.realpathSync.native` call with an EISDIR
 * failure — the exact failure Vite treats as "keep using the JS realpath", which
 * handles Unicode paths correctly on Windows. Run:
 *
 *   node scripts/vitest-local.mjs run --pool=threads
 */
import cp from 'node:child_process'
import fs from 'node:fs'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const nativeRealpath = fs.realpathSync.native
let probed = false
fs.realpathSync.native = function patchedNativeRealpath(path, options) {
  if (!probed) {
    probed = true
    const error = new Error(`EISDIR: illegal operation on a directory, realpath '${String(path)}'`)
    error.code = 'EISDIR'
    error.errno = -4068
    error.syscall = 'realpath'
    throw error
  }
  return nativeRealpath.call(fs, path, options)
}

const realExec = cp.exec
cp.exec = function patchedExec(command, options, callback) {
  if (typeof options === 'function') { callback = options; options = undefined }
  if (typeof callback === 'function') process.nextTick(() => callback(null, '', ''))
  void command
  return new cp.ChildProcess()
}
void realExec

// Under pnpm, reach the CLI through the real `.pnpm` store path: the `node_modules/vitest`
// junction carries a `Global\` target that neither `fs.realpathSync` nor ESM resolution
// follows here. A flat (npm) install has the real directory directly.
const pnpmStore = new URL('../node_modules/.pnpm/', import.meta.url)
let cliUrl
if (existsSync(pnpmStore)) {
  const { readdirSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const storePath = fileURLToPath(pnpmStore)
  const vitestDir = readdirSync(storePath)
    .filter(name => /^vitest@\d/.test(name))
    .map(name => `${storePath}${name}\\node_modules\\vitest`)
    .find(candidate => existsSync(`${candidate}\\vitest.mjs`))
  if (vitestDir === undefined) throw new Error('vitest-local: no vitest package found under node_modules/.pnpm')
  cliUrl = pathToFileURL(`${vitestDir}\\vitest.mjs`)
} else {
  cliUrl = new URL('../node_modules/vitest/vitest.mjs', import.meta.url)
}

await import(cliUrl)
